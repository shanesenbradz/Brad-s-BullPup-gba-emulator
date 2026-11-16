/* Brad's Bullpup: link cable over a network, for two players.
 *
 * Included at the end of mgba_shim.c so it can see the shim's `core`.
 *
 * How it works. Real link cables are synchronous: the clock owner shifts a value
 * out and, at the same moment, shifts the other console's value in. Over Wi-Fi or
 * Bluetooth we cannot do that in one instant, so the side that drives the clock
 * (the "master") sends its value, keeps emulating for as long as the real transfer
 * takes, and then pauses its CPU until the other side's value arrives. The other
 * side answers as soon as the request lands: it completes its own transfer with
 * the master's value and replies with what was in its own send register.
 *
 * The page talks to this file through a tiny mailbox:
 *   - after each run call, JS reads the outbox and sends anything in it
 *   - a request from the other phone goes in with mgbawasm_link_request(),
 *     which returns the reply to send back
 *   - a reply for our own transfer goes in with mgbawasm_link_reply()
 * and mgbawasm_run_link() runs the rest of a frame, stopping early while paused.
 *
 * GBA: multiplayer mode (Pokemon Ruby to Emerald, FireRed and LeafGreen cable
 * club, and most 2-player games) and normal 8/32-bit mode. The host is player 1
 * (id 0, the multiplayer master). Game Boy / Color: the serial port, used by
 * Pokemon Red to Crystal for trades and battles. On the Game Boy either side can
 * drive the clock; if both start at once, each side finishes with the other's byte.
 */

#include <mgba/internal/gba/gba.h>
#include <mgba/internal/gba/io.h>
#include <mgba/internal/gba/sio.h>
#include <mgba/internal/gb/gb.h>
#include <mgba/internal/gb/io.h>
#include <mgba/internal/gb/sio.h>

enum {
	LINK_OFF = 0,
	LINK_HOST = 1,
	LINK_GUEST = 2,
};

enum {
	LMODE_GB = 0,
	LMODE_MULTI = 1,
	LMODE_NORMAL8 = 2,
	LMODE_NORMAL32 = 3,
};

/* Layout read directly from JS: keep it 4-byte fields. */
struct LinkMailbox {
	int32_t outHas;     /* 1 when a request is waiting to be sent */
	int32_t outSeq;
	int32_t outMode;
	uint32_t outValue;
	int32_t waiting;    /* 1 while our CPU is paused for a reply */
	int32_t transfers;  /* completed transfers, for the status line */
	int32_t timeouts;
	int32_t replyHas;   /* 1 when an answer to the other side's transfer is ready to send */
	int32_t replySeq;
	uint32_t replyValue;
	int32_t rxPending;  /* 1 while their request waits for our game to get ready */
};

static struct LinkMailbox mbox = {0};
static int linkRole = LINK_OFF;
static int linkSeq = 0;
static int pendingSeq = -1;       /* our own outstanding transfer, -1 if none */
static int pendingMode = 0;
static int replyHas = 0;
static uint32_t replyValue = 0;
static int frameActive = 0;
static uint32_t frameStartCounter = 0;
static uint32_t frameStartCycle = 0;

static struct mTimingEvent linkEvent;

/* The other side's request waits here until our game has re-armed its port. Without
 * this, two requests landing before our CPU runs again would both read a stale value. */
static int rxSeq = 0;
static int rxMode = 0;
static uint32_t rxValue = 0;
static uint32_t rxArrived = 0;
static uint32_t slaveDoneAt = 0;
static int slaveDoneValid = 0;
static uint32_t _now(void);
static uint32_t _answer(int mode, uint32_t theirs);

/* ------------------------------------------------------------------ GBA */

struct BullpupGBASIO {
	struct GBASIODriver d;
};
static struct BullpupGBASIO gbaDriver;

static struct GBA* _gba(void) {
	return core && core->platform(core) == mPLATFORM_GBA ? core->board : NULL;
}

static struct GB* _gb(void) {
	return core && core->platform(core) == mPLATFORM_GB ? core->board : NULL;
}

static int _gbaId(void) {
	return linkRole == LINK_GUEST ? 1 : 0;
}

static bool _gbaHandles(struct GBASIODriver* driver, enum GBASIOMode mode) {
	UNUSED(driver);
	return mode == GBA_SIO_MULTI || mode == GBA_SIO_NORMAL_8 || mode == GBA_SIO_NORMAL_32;
}

static int _gbaConnected(struct GBASIODriver* driver) {
	UNUSED(driver);
	return linkRole ? 1 : 0;
}

static int _gbaDeviceId(struct GBASIODriver* driver) {
	UNUSED(driver);
	return _gbaId();
}

static uint16_t _gbaWriteSIOCNT(struct GBASIODriver* driver, uint16_t value) {
	struct GBASIO* sio = driver->p;
	switch (sio->mode) {
	case GBA_SIO_MULTI:
		value = GBASIOMultiplayerFillReady(value);
		break;
	case GBA_SIO_NORMAL_8:
	case GBA_SIO_NORMAL_32:
		/* SI reads low when the other side is ready to receive */
		value = GBASIONormalClearSi(value);
		break;
	default:
		break;
	}
	return value;
}

static void _queueOut(int mode, uint32_t value, int32_t cycles, struct mTiming* timing) {
	pendingSeq = ++linkSeq;
	pendingMode = mode;
	replyHas = 0;
	mbox.outHas = 1;
	mbox.outSeq = pendingSeq;
	mbox.outMode = mode;
	mbox.outValue = value;
	mTimingDeschedule(timing, &linkEvent);
	mTimingSchedule(timing, &linkEvent, cycles > 0 ? cycles : 1);
}

/* Master side: the game started a transfer. Send our value now, finish later. */
static bool _gbaStart(struct GBASIODriver* driver) {
	struct GBASIO* sio = driver->p;
	struct GBA* gba = sio->p;
	uint32_t value;
	int mode;
	switch (sio->mode) {
	case GBA_SIO_MULTI:
		mode = LMODE_MULTI;
		value = gba->memory.io[GBA_REG(SIOMLT_SEND)];
		break;
	case GBA_SIO_NORMAL_8:
		mode = LMODE_NORMAL8;
		value = gba->memory.io[GBA_REG(SIODATA8)] & 0xFF;
		break;
	case GBA_SIO_NORMAL_32:
		mode = LMODE_NORMAL32;
		value = gba->memory.io[GBA_REG(SIODATA32_LO)] | ((uint32_t) gba->memory.io[GBA_REG(SIODATA32_HI)] << 16);
		break;
	default:
		return true;
	}
	if (mode != LMODE_MULTI && !GBASIONormalIsSc(sio->siocnt)) {
		/* external clock: we are the slave in normal mode, the other side drives it */
		return false;
	}
	_queueOut(mode, value, GBASIOTransferCycles(sio->mode, sio->siocnt, 1), &gba->timing);
	gba->earlyExit = true; /* hand control back so the page can send right away */
	return false; /* completion is ours */
}

static void _gbaFinish(struct GBA* gba, int mode, uint32_t mine, uint32_t theirs, int asMaster) {
	struct GBASIO* sio = &gba->sio;
	if (mode == LMODE_MULTI) {
		uint16_t data[4] = { 0xFFFF, 0xFFFF, 0xFFFF, 0xFFFF };
		data[0] = asMaster ? mine : theirs;
		data[1] = asMaster ? theirs : mine;
		GBASIOMultiplayerFinishTransfer(sio, data, 0);
	} else if (mode == LMODE_NORMAL8) {
		GBASIONormal8FinishTransfer(sio, theirs & 0xFF, 0);
	} else {
		GBASIONormal32FinishTransfer(sio, theirs, 0);
	}
}

/* ------------------------------------------------------------------- GB */

struct BullpupGBSIO {
	struct GBSIODriver d;
	uint8_t sb;
};
static struct BullpupGBSIO gbDriver;

static void _gbWriteSB(struct GBSIODriver* driver, uint8_t value) {
	((struct BullpupGBSIO*) driver)->sb = value;
}

static uint8_t _gbWriteSC(struct GBSIODriver* driver, uint8_t value) {
	struct GB* gb = driver->p->p;
	if (GBRegisterSCIsEnable(value) && GBRegisterSCIsShiftClock(value)) {
		/* internal clock: we drive this byte. Stop mGBA's own shifter and do it ourselves. */
		mTimingDeschedule(&gb->timing, &driver->p->event);
		driver->p->remainingBits = 0;
		int32_t cycles = GBSIOCyclesPerTransfer[GBRegisterSCGetClockSpeed(value)] * 8 * (2 - gb->doubleSpeed);
		_queueOut(LMODE_GB, gb->memory.io[GB_REG_SB], cycles, &gb->timing);
		gb->earlyExit = true;
	}
	return value;
}

static void _gbFinish(struct GB* gb, uint8_t theirs) {
	gb->memory.io[GB_REG_SB] = theirs;
	gb->memory.io[GB_REG_SC] = GBRegisterSCClearEnable(gb->memory.io[GB_REG_SC]);
	gb->memory.io[GB_REG_IF] |= (1 << GB_IRQ_SIO);
	GBUpdateIRQs(gb);
}

/* ------------------------------------------------------- shared logic */

static void _completePending(void) {
	int mode = pendingMode;
	uint32_t theirs = replyValue;
	pendingSeq = -1;
	replyHas = 0;
	mbox.waiting = 0;
	mbox.transfers++;
	struct GBA* gba = _gba();
	struct GB* gb = _gb();
	if (gba) {
		uint32_t mine = mode == LMODE_MULTI ? gba->memory.io[GBA_REG(SIOMLT_SEND)] : 0;
		_gbaFinish(gba, mode, mine, theirs, 1);
	} else if (gb) {
		_gbFinish(gb, theirs & 0xFF);
	}
}

/* Fires when the real transfer would have ended. Finish if the reply is in, else pause. */
static void _linkEventCb(struct mTiming* timing, void* context, uint32_t cyclesLate) {
	UNUSED(timing);
	UNUSED(context);
	UNUSED(cyclesLate);
	if (pendingSeq < 0) {
		return;
	}
	if (replyHas) {
		_completePending();
		return;
	}
	mbox.waiting = 1;
	struct GBA* gba = _gba();
	struct GB* gb = _gb();
	if (gba) {
		gba->earlyExit = true;
	} else if (gb) {
		gb->earlyExit = true;
	}
}

/* ------------------------------------------------------------- exports */

EXPORT void* mgbawasm_link_mailbox(void) {
	return &mbox;
}

/** role: 0 off, 1 host (player 1), 2 guest (player 2) */
EXPORT int mgbawasm_link_set_role(int role) {
	struct GBA* gba = _gba();
	struct GB* gb = _gb();
	pendingSeq = -1;
	replyHas = 0;
	memset(&mbox, 0, sizeof(mbox));
	slaveDoneValid = 0;
	linkRole = role;
	frameActive = 0;

	linkEvent.context = NULL;
	linkEvent.name = "Bullpup link";
	linkEvent.callback = _linkEventCb;
	linkEvent.priority = 0x81;

	if (gba) {
		mTimingDeschedule(&gba->timing, &linkEvent);
		if (role) {
			memset(&gbaDriver, 0, sizeof(gbaDriver));
			gbaDriver.d.handlesMode = _gbaHandles;
			gbaDriver.d.connectedDevices = _gbaConnected;
			gbaDriver.d.deviceId = _gbaDeviceId;
			gbaDriver.d.writeSIOCNT = _gbaWriteSIOCNT;
			gbaDriver.d.start = _gbaStart;
			GBASIOSetDriver(&gba->sio, &gbaDriver.d);
		} else {
			GBASIOSetDriver(&gba->sio, NULL);
		}
		/* Rewrite SIOCNT so it picks up the new id, slave and ready bits. mGBA keeps the
		 * read-only bits from the old value, so clear them first or a phone that booted
		 * unlinked would still read as a slave. */
		uint16_t cnt = gba->sio.siocnt;
		gba->sio.siocnt &= ~0x0074;
		GBASIOWriteSIOCNT(&gba->sio, cnt & ~0x0074);
		return 1;
	}
	if (gb) {
		mTimingDeschedule(&gb->timing, &linkEvent);
		if (role) {
			memset(&gbDriver, 0, sizeof(gbDriver));
			gbDriver.d.writeSB = _gbWriteSB;
			gbDriver.d.writeSC = _gbWriteSC;
			GBSIOSetDriver(&gb->sio, &gbDriver.d);
		} else {
			GBSIOSetDriver(&gb->sio, NULL);
		}
		return 1;
	}
	return 0;
}

/** Marks the outbox as sent. */
EXPORT void mgbawasm_link_out_sent(void) {
	mbox.outHas = 0;
}

/** The other phone answered our transfer. */
EXPORT void mgbawasm_link_reply(int seq, uint32_t value) {
	if (seq != pendingSeq) {
		return; /* stale, or already finished because both sides started at once */
	}
	replyHas = 1;
	replyValue = value;
	if (mbox.waiting) {
		_completePending();
	}
}

/**
 * The other phone drove a transfer. Finish ours with its value and return what we
 * send back.
 */
static uint32_t _answer(int mode, uint32_t theirs) {
	struct GBA* gba = _gba();
	struct GB* gb = _gb();
	if (gba) {
		struct GBASIO* sio = &gba->sio;
		uint32_t mine;
		if (mode == LMODE_MULTI) {
			if (sio->mode != GBA_SIO_MULTI) {
				return 0xFFFF;
			}
			mine = gba->memory.io[GBA_REG(SIOMLT_SEND)];
			if (_gbaId() == 0) {
				/* both think they're player 1: shouldn't happen with fixed roles */
				return 0xFFFF;
			}
			sio->siocnt = GBASIOMultiplayerFillBusy(sio->siocnt);
			_gbaFinish(gba, mode, mine, theirs, 0);
		} else {
			if (sio->mode != GBA_SIO_NORMAL_8 && sio->mode != GBA_SIO_NORMAL_32) {
				return mode == LMODE_NORMAL8 ? 0xFF : 0xFFFFFFFFu;
			}
			if (sio->mode == GBA_SIO_NORMAL_8) {
				mine = gba->memory.io[GBA_REG(SIODATA8)] & 0xFF;
			} else {
				mine = gba->memory.io[GBA_REG(SIODATA32_LO)] | ((uint32_t) gba->memory.io[GBA_REG(SIODATA32_HI)] << 16);
			}
			if (pendingSeq >= 0) {
				/* both drove the clock at once: each side takes the other's value */
				pendingSeq = -1;
				mbox.waiting = 0;
				mTimingDeschedule(&gba->timing, &linkEvent);
				_gbaFinish(gba, sio->mode == GBA_SIO_NORMAL_8 ? LMODE_NORMAL8 : LMODE_NORMAL32, mine, theirs, 0);
			} else if (GBASIONormalIsStart(sio->siocnt)) {
				_gbaFinish(gba, sio->mode == GBA_SIO_NORMAL_8 ? LMODE_NORMAL8 : LMODE_NORMAL32, mine, theirs, 0);
			}
		}
		mbox.transfers++;
		return mine;
	}
	if (gb) {
		uint8_t mine = gb->memory.io[GB_REG_SB];
		uint8_t sc = gb->memory.io[GB_REG_SC];
		if (pendingSeq >= 0) {
			/* we were driving a byte too: finish ours with theirs */
			pendingSeq = -1;
			mbox.waiting = 0;
			mTimingDeschedule(&gb->timing, &linkEvent);
			_gbFinish(gb, theirs & 0xFF);
		} else if (GBRegisterSCIsEnable(sc)) {
			_gbFinish(gb, theirs & 0xFF);
		}
		mbox.transfers++;
		return mine;
	}
	return 0xFFFFFFFFu;
}

static uint32_t _now(void) {
	struct GBA* gba = _gba();
	struct GB* gb = _gb();
	return gba ? mTimingCurrentTime(&gba->timing) : gb ? mTimingCurrentTime(&gb->timing) : 0;
}

/* Is our game ready to take part in the other side's transfer? It is if its port is armed,
 * or if it's idle (no exchange in the last frame). Mid-exchange we give it up to a frame
 * to load its next value, which is what keeps fast byte streams like Pokemon trades intact. */
static int _slaveReady(void) {
	if (pendingSeq >= 0) {
		return 1; /* we're driving one too: settle both now */
	}
	struct GBA* gba = _gba();
	struct GB* gb = _gb();
	uint32_t frame = gba ? 280896 : 70224;
	uint32_t now = _now();
	uint32_t since = slaveDoneValid ? now - slaveDoneAt : 0xFFFFFFFFu;
	if (now - rxArrived > frame || since > frame) {
		return 1;
	}
	if (gba) {
		if (gba->sio.mode == GBA_SIO_MULTI) {
			return since >= 2048; /* give the SIO interrupt handler time to load the next value */
		}
		if (gba->sio.mode == GBA_SIO_NORMAL_8 || gba->sio.mode == GBA_SIO_NORMAL_32) {
			return GBASIONormalIsStart(gba->sio.siocnt) && since >= 512;
		}
		return 1;
	}
	if (gb) {
		uint8_t sc = gb->memory.io[GB_REG_SC];
		return GBRegisterSCIsEnable(sc) && !GBRegisterSCIsShiftClock(sc);
	}
	return 1;
}

static void _serviceRx(void) {
	if (!mbox.rxPending || mbox.replyHas || !_slaveReady()) {
		return;
	}
	uint32_t v = _answer(rxMode, rxValue);
	slaveDoneAt = _now();
	slaveDoneValid = 1;
	mbox.rxPending = 0;
	mbox.replyHas = 1;
	mbox.replySeq = rxSeq;
	mbox.replyValue = v;
}

/** The other phone drove a transfer. The answer shows up in the mailbox (replyHas). */
EXPORT void mgbawasm_link_request(int seq, int mode, uint32_t theirs) {
	rxSeq = seq;
	rxMode = mode;
	rxValue = theirs;
	rxArrived = _now();
	mbox.rxPending = 1;
	_serviceRx();
}

EXPORT void mgbawasm_link_reply_sent(void) {
	mbox.replyHas = 0;
}

EXPORT int mgbawasm_link_waiting(void) {
	return mbox.waiting;
}

/** Gives up on a transfer that never got an answer, as if the cable was unplugged. */
EXPORT void mgbawasm_link_timeout(void) {
	if (pendingSeq < 0) {
		return;
	}
	replyValue = _gb() ? 0xFF : 0xFFFFFFFFu;
	replyHas = 1;
	mbox.timeouts++;
	_completePending();
}

/**
 * Runs until the current frame ends or the link pauses us. Returns 1 when a frame
 * finished (the video buffer is fresh), 0 when paused or handing back an outgoing
 * request mid-frame. Call again to continue the same frame.
 */
EXPORT int mgbawasm_run_link(void) {
	if (!core) {
		return 1;
	}
	struct GBA* gba = _gba();
	struct GB* gb = _gb();
	if (!frameActive) {
		frameActive = 1;
		frameStartCounter = core->frameCounter(core);
		frameStartCycle = gba ? mTimingCurrentTime(&gba->timing) : gb ? mTimingCurrentTime(&gb->timing) : 0;
	}
	uint32_t limit = gba ? VIDEO_TOTAL_LENGTH + VIDEO_HORIZONTAL_LENGTH : 70224 * 2 + 456;
	while (core->frameCounter(core) == frameStartCounter) {
		_serviceRx();
		if (mbox.waiting || mbox.outHas || mbox.replyHas) {
			return 0;
		}
		uint32_t now = gba ? mTimingCurrentTime(&gba->timing) : gb ? mTimingCurrentTime(&gb->timing) : 0;
		if (now - frameStartCycle >= limit) {
			break;
		}
		core->runLoop(core);
	}
	frameActive = 0;
	_serviceRx();
	mgbawasm_pack_video();
	return 1;
}

/** Reads a byte from the emulated bus (used by the test harness). */
EXPORT int mgbawasm_bus_read8(uint32_t address) {
	return core ? core->busRead8(core, address) : -1;
}
