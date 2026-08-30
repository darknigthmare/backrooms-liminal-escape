import {
  DIFFICULTIES,
  ENDINGS,
  ZONE_DEFS,
  clamp,
  createRun,
  distance,
  findPath,
  hasLineOfSight,
  isWalkable,
  sanitizeRun,
  scoreRun,
  unlockedFinalEndings,
} from "./core.mjs";

const RUN_KEY = "liminalEscape.v3.run";
const CHECKPOINT_KEY = "liminalEscape.v3.checkpoint";
const PROFILE_KEY = "liminalEscape.v3.profile";
const LOG_LIMIT = 9;
const TWO_PI = Math.PI * 2;

const DEFAULT_SETTINGS = Object.freeze({
  audio: true,
  volume: 0.55,
  captions: true,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  highContrast: false,
  screenShake: true,
  autoPause: true,
});

function byId(id) {
  return document.getElementById(id);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60);
  return String(minutes).padStart(2, "0") + ":" + String(remaining).padStart(2, "0");
}

function formatDate(timestamp) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(timestamp));
  } catch {
    return "date inconnue";
  }
}

function directionLabel(dx, dy) {
  const angle = Math.atan2(dy, dx);
  const names = ["est", "sud-est", "sud", "sud-ouest", "ouest", "nord-ouest", "nord", "nord-est"];
  const index = Math.round(angle / (Math.PI / 4));
  return names[(index + 8) % 8];
}

function safeStorageRead(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function safeStorageWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

class SaveStore {
  loadProfile() {
    const stored = safeStorageRead(PROFILE_KEY, {});
    return {
      version: 3,
      endings: Array.isArray(stored.endings) ? stored.endings.filter((id) => ENDINGS[id]) : [],
      bestScore: Math.max(0, Number(stored.bestScore) || 0),
      runs: Math.max(0, Number(stored.runs) || 0),
      failures: Math.max(0, Number(stored.failures) || 0),
      settings: { ...DEFAULT_SETTINGS, ...(stored.settings || {}) },
    };
  }

  saveProfile(profile) {
    return safeStorageWrite(PROFILE_KEY, profile);
  }

  loadRun() {
    return sanitizeRun(safeStorageRead(RUN_KEY, null));
  }

  saveRun(run) {
    run.updatedAt = Date.now();
    return safeStorageWrite(RUN_KEY, run);
  }

  clearRun() {
    try {
      localStorage.removeItem(RUN_KEY);
    } catch {}
  }

  loadCheckpoint() {
    return sanitizeRun(safeStorageRead(CHECKPOINT_KEY, null));
  }

  saveCheckpoint(run) {
    return safeStorageWrite(CHECKPOINT_KEY, run);
  }

  clearCheckpoint() {
    try {
      localStorage.removeItem(CHECKPOINT_KEY);
    } catch {}
  }

  clearActive() {
    this.clearRun();
    this.clearCheckpoint();
  }
}

class InputController {
  constructor(app) {
    this.app = app;
    this.keys = new Set();
    this.pressed = new Set();
    this.bindKeyboard();
    this.bindTouch();
  }

  bindKeyboard() {
    window.addEventListener("keydown", (event) => {
      if (event.key === "Tab" && this.app.modalOpen) {
        this.app.trapModalFocus(event);
        return;
      }
      if (event.code === "Escape") {
        event.preventDefault();
        this.app.togglePause();
        return;
      }
      if (this.app.screen !== "game" || this.app.modalOpen || this.app.manualPaused) return;
      if (event.target instanceof HTMLButtonElement || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
      const captured = [
        "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space",
        "KeyW", "KeyA", "KeyS", "KeyD", "KeyZ", "KeyQ", "KeyE",
        "KeyF", "KeyC", "Digit1", "Digit2", "Digit3", "ShiftLeft", "ShiftRight",
      ];
      if (captured.includes(event.code)) event.preventDefault();
      if (!this.keys.has(event.code)) this.pressed.add(event.code);
      this.keys.add(event.code);
    }, { passive: false });

    window.addEventListener("keyup", (event) => {
      this.keys.delete(event.code);
    });
    window.addEventListener("blur", () => this.clear());
  }

  bindTouch() {
    document.querySelectorAll("[data-input]").forEach((button) => {
      const code = button.dataset.input;
      const down = (event) => {
        event.preventDefault();
        this.app.audio.ensure();
        if (!this.keys.has(code)) this.pressed.add(code);
        this.keys.add(code);
        button.classList.add("active");
        button.setPointerCapture?.(event.pointerId);
      };
      const up = (event) => {
        event.preventDefault();
        this.keys.delete(code);
        button.classList.remove("active");
      };
      button.addEventListener("pointerdown", down);
      button.addEventListener("pointerup", up);
      button.addEventListener("pointercancel", up);
      button.addEventListener("lostpointercapture", up);
    });

    document.querySelectorAll("[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        this.app.audio.ensure();
        this.app.performAction(button.dataset.action);
      });
    });
  }

  is(...codes) {
    return codes.some((code) => this.keys.has(code));
  }

  consume(...codes) {
    for (const code of codes) {
      if (!this.pressed.has(code)) continue;
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  endFrame() {
    this.pressed.clear();
  }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    document.querySelectorAll("[data-input].active").forEach((button) => button.classList.remove("active"));
  }
}

class AudioDirector {
  constructor(getSettings, caption) {
    this.getSettings = getSettings;
    this.caption = caption;
    this.context = null;
    this.master = null;
    this.humGain = null;
    this.threatGain = null;
    this.lastThreatCue = 0;
  }

  ensure() {
    const settings = this.getSettings();
    if (!settings.audio) return null;
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = settings.volume;
      this.master.connect(this.context.destination);

      const hum = this.context.createOscillator();
      const humFilter = this.context.createBiquadFilter();
      this.humGain = this.context.createGain();
      hum.type = "sawtooth";
      hum.frequency.value = 58.4;
      humFilter.type = "lowpass";
      humFilter.frequency.value = 150;
      this.humGain.gain.value = 0.018;
      hum.connect(humFilter).connect(this.humGain).connect(this.master);
      hum.start();

      const threat = this.context.createOscillator();
      this.threatGain = this.context.createGain();
      threat.type = "sine";
      threat.frequency.value = 37;
      this.threatGain.gain.value = 0.0001;
      threat.connect(this.threatGain).connect(this.master);
      threat.start();
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
    this.applySettings();
    return this.context;
  }

  applySettings() {
    if (!this.master) return;
    const settings = this.getSettings();
    this.master.gain.setTargetAtTime(settings.audio ? settings.volume : 0.0001, this.context.currentTime, 0.04);
  }

  tone(frequency, duration = 0.12, type = "sine", volume = 0.08, slide = 0) {
    const context = this.ensure();
    if (!context || !this.master) return;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(24, frequency), now);
    if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(24, frequency + slide), now + duration);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), now + Math.min(.025, duration / 3));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + .03);
  }

  noise(duration = .18, volume = .06, cutoff = 900) {
    const context = this.ensure();
    if (!context || !this.master) return;
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = cutoff;
    gain.gain.setValueAtTime(volume, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }

  cue(name) {
    if (name === "pickup") {
      this.tone(420, .09, "triangle", .07, 120);
      this.tone(630, .12, "triangle", .05, 100);
    } else if (name === "objective") {
      this.tone(164, .34, "triangle", .07, 160);
      this.tone(246, .32, "triangle", .05, 170);
    } else if (name === "note") {
      this.noise(.12, .035, 1600);
      this.tone(196, .5, "sine", .055, -40);
    } else if (name === "attack") {
      this.noise(.38, .15, 520);
      this.tone(56, .42, "sawtooth", .1, -18);
    } else if (name === "pulse") {
      [90, 180, 360, 720].forEach((frequency, index) => this.tone(frequency, .3, "sawtooth", .045, index * 20));
    } else if (name === "door") {
      this.noise(.65, .08, 320);
      this.tone(72, .7, "sine", .06, -20);
    } else if (name === "empty") {
      this.tone(92, .16, "square", .035, -30);
    }
  }

  update(threatDistance, threatState) {
    if (!this.context || !this.threatGain || !this.humGain) return;
    const proximity = clamp(1 - threatDistance / 10, 0, 1);
    const intensity = threatState === "chase" ? .075 : threatState === "investigate" ? .035 : .012;
    this.threatGain.gain.setTargetAtTime(Math.max(.0001, proximity * intensity), this.context.currentTime, .12);
    this.humGain.gain.setTargetAtTime(.014 + proximity * .018, this.context.currentTime, .18);
    if (threatState === "chase" && proximity > .45 && performance.now() - this.lastThreatCue > 2400) {
      this.lastThreatCue = performance.now();
      this.caption("Battements sourds, très proches.");
    }
  }
}

class LiminalEscapeApp {
  constructor() {
    this.store = new SaveStore();
    this.profile = this.store.loadProfile();
    this.settings = this.profile.settings;
    this.screen = "menu";
    this.run = null;
    this.zone = null;
    this.logs = [];
    this.modalOpen = false;
    this.modalKind = "";
    this.modalDismiss = null;
    this.lastFocus = null;
    this.manualPaused = false;
    this.lastFrame = performance.now();
    this.uiClock = 0;
    this.saveClock = 0;
    this.captionTimer = 0;
    this.hazardCooldown = 0;
    this.ambientClock = 8;
    this.screenFlash = 0;
    this.screenShake = 0;
    this.renderDirty = true;
    this.exploredSet = new Set();
    this.pendingInteraction = null;
    this.previousThreatBand = "quiet";
    this.pixelRatio = 1;
    this.canvasWidth = 1280;
    this.canvasHeight = 720;
    this.refs = this.collectRefs();
    this.context = this.refs.canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.audio = new AudioDirector(() => this.settings, (text) => this.caption(text));
    this.input = new InputController(this);
    this.bindUi();
    this.applySettings();
    this.resizeCanvas();
    this.updateMenu();
    this.registerServiceWorker();
    this.bindLifecycle();
    requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  collectRefs() {
    return {
      appFrame: byId("appFrame"),
      menu: byId("menuScreen"),
      game: byId("gameScreen"),
      topbar: byId("gameTopbar"),
      runCode: byId("runCode"),
      canvas: byId("gameCanvas"),
      canvasDescription: byId("canvasDescription"),
      modal: byId("modal"),
      modalEyebrow: byId("modalEyebrow"),
      modalTitle: byId("modalTitle"),
      modalBody: byId("modalBody"),
      modalActions: byId("modalActions"),
      announcer: byId("announcer"),
      continueButton: byId("continueButton"),
      continueSummary: byId("continueSummary"),
      archiveSummary: byId("archiveSummary"),
      audioButton: byId("audioButton"),
      zoneName: byId("zoneName"),
      objectiveText: byId("objectiveText"),
      objectiveProgress: byId("objectiveProgress"),
      healthValue: byId("healthValue"),
      healthMeter: byId("healthMeter"),
      batteryValue: byId("batteryValue"),
      batteryMeter: byId("batteryMeter"),
      staminaValue: byId("staminaValue"),
      staminaMeter: byId("staminaMeter"),
      composureValue: byId("composureValue"),
      composureMeter: byId("composureMeter"),
      threatState: byId("threatState"),
      threatMeter: byId("threatMeter"),
      threatHint: byId("threatHint"),
      batteryCount: byId("batteryCount"),
      medkitCount: byId("medkitCount"),
      stabilizerCount: byId("stabilizerCount"),
      pulseButton: byId("pulseButton"),
      pulseValue: byId("pulseValue"),
      eventLog: byId("eventLog"),
      saveIndicator: byId("saveIndicator"),
      dangerSignal: byId("dangerSignal"),
      interactionPrompt: byId("interactionPrompt"),
      interactionText: byId("interactionText"),
      caption: byId("caption"),
    };
  }

  bindUi() {
    byId("newGameButton").addEventListener("click", () => this.openNewGameDialog());
    this.refs.continueButton.addEventListener("click", () => this.continueGame());
    byId("archiveButton").addEventListener("click", () => this.openArchives());
    byId("settingsButtonMenu").addEventListener("click", () => this.openSettings());
    byId("settingsButtonGame").addEventListener("click", () => this.openSettings());
    byId("pauseButton").addEventListener("click", () => this.togglePause());
    this.refs.audioButton.addEventListener("click", () => {
      this.settings.audio = !this.settings.audio;
      this.saveSettings();
      this.audio.ensure();
    });
    this.refs.pulseButton.addEventListener("click", () => this.pulse());
    document.querySelectorAll("[data-use]").forEach((button) => {
      button.addEventListener("click", () => this.useResource(button.dataset.use));
    });
    window.addEventListener("resize", () => this.resizeCanvas(), { passive: true });
  }

  bindLifecycle() {
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden || this.screen !== "game" || !this.run) return;
      this.saveGame("SAUVEGARDE AUTO");
      this.input.clear();
      if (this.settings.autoPause && !this.modalOpen) {
        this.manualPaused = true;
        this.openPauseDialog("PAUSE AUTOMATIQUE");
      }
    });
    window.addEventListener("online", () => this.announce("Connexion rétablie. Le jeu reste disponible hors ligne."));
    window.addEventListener("offline", () => this.announce("Mode hors ligne. La partie reste enregistrée sur cet appareil."));
  }

  registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }, { once: true });
  }

  applySettings() {
    document.body.classList.toggle("reduced-motion", Boolean(this.settings.reducedMotion));
    document.body.classList.toggle("high-contrast", Boolean(this.settings.highContrast));
    this.audio?.applySettings();
    this.refs.audioButton.textContent = this.settings.audio ? "SON" : "MUET";
    this.refs.audioButton.setAttribute("aria-pressed", String(Boolean(this.settings.audio)));
    this.refs.audioButton.setAttribute("aria-label", this.settings.audio ? "Couper le son" : "Activer le son");
    this.renderDirty = true;
  }

  saveSettings() {
    this.profile.settings = { ...this.settings };
    this.store.saveProfile(this.profile);
    this.applySettings();
  }

  updateMenu() {
    const activeRun = this.store.loadRun();
    const checkpoint = activeRun ? null : this.store.loadCheckpoint();
    const saved = activeRun || checkpoint;
    this.refs.continueButton.disabled = !saved;
    this.refs.continueSummary.textContent = saved
      ? (activeRun ? "" : "Checkpoint · ") + ZONE_DEFS[saved.zoneIndex].shortName + " · " + formatTime(saved.stats.elapsed) + " · " + formatDate(saved.updatedAt)
      : "Aucune sauvegarde";
    const count = this.profile.endings.length;
    this.refs.archiveSummary.textContent = count + " issue" + (count > 1 ? "s" : "") + " découverte" + (count > 1 ? "s" : "");
  }

  showMenu() {
    this.screen = "menu";
    document.body.dataset.screen = "menu";
    this.refs.menu.hidden = false;
    this.refs.game.hidden = true;
    this.refs.topbar.hidden = true;
    this.manualPaused = false;
    this.input.clear();
    this.updateMenu();
  }

  showGame() {
    this.screen = "game";
    document.body.dataset.screen = "game";
    this.refs.menu.hidden = true;
    this.refs.game.hidden = false;
    this.refs.topbar.hidden = false;
    this.refs.runCode.textContent = this.run ? this.run.seed.toString(16).toUpperCase().slice(0, 8) : "—";
    this.resizeCanvas();
    this.renderDirty = true;
  }

  openNewGameDialog() {
    const hasSave = Boolean(this.store.loadRun() || this.store.loadCheckpoint());
    const warning = hasSave ? "<p><strong>Attention :</strong> la sauvegarde active sera remplacée. Les fins archivées resteront acquises.</p>" : "";
    const body = warning +
      "<p>Choisissez la pression de survie. Chaque descente génère de nouveaux couloirs tout en conservant une sortie atteignable.</p>" +
      "<div class=\"difficulty-grid\" role=\"radiogroup\" aria-label=\"Difficulté\">" +
        this.difficultyOption("exploration", "Exploration", "Plus de ressources, menaces moins rapides.", false) +
        this.difficultyOption("survival", "Survie", "Équilibre recommandé entre lecture et danger.", true) +
        this.difficultyOption("nightmare", "Cauchemar", "Ressources rares, dégâts et poursuites accrus.", false) +
      "</div>";
    this.showModal({
      kind: "new-game",
      eyebrow: "NOUVELLE DESCENTE",
      title: "CHOISIR LE RISQUE",
      body,
      dismissible: true,
      actions: [
        { label: "Annuler", action: () => this.closeModal() },
        {
          label: "Descendre",
          primary: true,
          action: () => {
            const checked = this.refs.modalBody.querySelector("input[name=difficulty]:checked");
            this.startNewGame(checked ? checked.value : "survival");
          },
        },
      ],
    });
  }

  difficultyOption(id, label, description, checked) {
    return "<div class=\"difficulty-option\"><input type=\"radio\" name=\"difficulty\" id=\"difficulty-" + id + "\" value=\"" + id + "\"" + (checked ? " checked" : "") + "><label for=\"difficulty-" + id + "\"><strong>" + label + "</strong><small>" + description + "</small></label></div>";
  }

  createSeed() {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return values[0] ^ Date.now();
    }
    return Math.floor(Math.random() * 0xffffffff) ^ Date.now();
  }

  startNewGame(difficultyId = "survival") {
    this.audio.ensure();
    this.closeModal(false);
    this.store.clearActive();
    this.run = createRun(this.createSeed(), difficultyId);
    this.logs = [];
    this.manualPaused = true;
    this.showGame();
    this.enterZone(0, true);
    this.showModal({
      kind: "intro",
      eyebrow: "CASSETTE 00 · CONSIGNE",
      title: "NE COUREZ PAS TOUT DE SUITE",
      body:
        "<p>Les couloirs réagissent au <strong>bruit</strong> et à la lumière. Marchez, écoutez, puis courez seulement lorsque la menace vous a trouvé.</p>" +
        "<p>Restaurez les relais de la zone, utilisez <strong>E</strong> près des objets et de la sortie, et gardez l’impulsion pour rompre une poursuite. Les alcôves sombres permettent de se cacher.</p>" +
        "<p>La progression est sauvegardée automatiquement et à chaque seuil.</p>",
      dismissible: false,
      actions: [{
        label: "Se relever",
        primary: true,
        action: () => {
          this.manualPaused = false;
          this.closeModal();
          this.refs.canvas.focus();
          this.audio.noise(.45, .04, 480);
        },
      }],
    });
  }

  continueGame() {
    const activeRun = this.store.loadRun();
    const loaded = activeRun || this.store.loadCheckpoint();
    if (!loaded) {
      this.updateMenu();
      return;
    }
    const fromCheckpoint = !activeRun;
    if (fromCheckpoint) {
      loaded.stats.retries = (loaded.stats.retries || 0) + 1;
      loaded.status = "playing";
      this.store.saveRun(clone(loaded));
    }
    this.audio.ensure();
    this.run = loaded;
    this.logs = [];
    this.manualPaused = true;
    this.showGame();
    this.restoreZone();
    this.log("La sauvegarde reprend au dernier battement enregistré.", "good");
    this.showModal({
      kind: "continue",
      eyebrow: "SIGNAL LOCAL RETROUVÉ",
      title: "REPRENDRE LA DESCENTE",
      body:
        "<p><strong>" + ZONE_DEFS[this.run.zoneIndex].name + "</strong></p>" +
        (fromCheckpoint ? "<p>Le signal actif a disparu. Reprise au dernier seuil stable.</p>" : "") +
        "<p>Temps écoulé : " + formatTime(this.run.stats.elapsed) + " · Santé : " + Math.round(this.run.player.health) + " % · Notes : " + this.run.stats.notes + "/3.</p>",
      dismissible: false,
      actions: [{
        label: "Reprendre",
        primary: true,
        action: () => {
          this.manualPaused = false;
          this.closeModal();
          this.refs.canvas.focus();
        },
      }],
    });
  }

  enterZone(index, createCheckpoint = true) {
    this.run.zoneIndex = index;
    this.zone = this.run.zones[index];
    this.run.player.x = this.zone.start.x;
    this.run.player.y = this.zone.start.y;
    this.run.player.hidden = false;
    this.run.player.crouching = false;
    this.run.zoneEnteredAt = Date.now();
    this.exploredSet = new Set(this.zone.explored || []);
    this.pendingInteraction = null;
    this.ambientClock = 7;
    this.previousThreatBand = "quiet";
    this.log(ZONE_DEFS[index].name + ". " + ZONE_DEFS[index].subtitle);
    this.revealAroundPlayer(5);
    this.updateUi(true);
    this.saveGame("SEUIL ENREGISTRÉ");
    if (createCheckpoint) this.store.saveCheckpoint(clone(this.run));
    this.renderDirty = true;
  }

  restoreZone() {
    this.zone = this.run.zones[this.run.zoneIndex];
    this.exploredSet = new Set(this.zone.explored || []);
    this.zone.threats.forEach((threat) => {
      threat.path = Array.isArray(threat.path) ? threat.path : [];
      threat.pathTimer = Number(threat.pathTimer) || 0;
      threat.cooldown = Number(threat.cooldown) || 0;
      threat.alert = Number(threat.alert) || 0;
      threat.state = ["patrol", "investigate", "chase", "stunned"].includes(threat.state) ? threat.state : "patrol";
    });
    this.revealAroundPlayer(4);
    this.updateUi(true);
    this.renderDirty = true;
  }

  openArchives() {
    const entries = Object.values(ENDINGS).map((ending) => {
      const unlocked = this.profile.endings.includes(ending.id);
      return "<article class=\"archive-entry" + (unlocked ? "" : " locked") + "\"><span>" + (unlocked ? ending.rank : "VERROUILLÉ") + "</span><strong>" + (unlocked ? ending.title : "ISSUE NON IDENTIFIÉE") + "</strong><p>" + (unlocked ? ending.text : "Une autre manière de traverser reste à découvrir.") + "</p></article>";
    }).join("");
    this.showModal({
      kind: "archives",
      eyebrow: "DOSSIER LOCAL",
      title: "ARCHIVES DES ISSUES",
      body:
        "<p>" + this.profile.endings.length + "/5 issues consignées · meilleur score : <strong>" + this.profile.bestScore.toLocaleString("fr-FR") + "</strong>.</p>" +
        "<div class=\"archive-grid\">" + entries + "</div>",
      dismissible: true,
      actions: [{ label: "Fermer", primary: true, action: () => this.closeModal() }],
    });
  }

  openSettings() {
    const inGame = this.screen === "game";
    if (inGame) this.manualPaused = true;
    const checkbox = (key, label, hint) => {
      return "<div class=\"setting-row\"><label for=\"setting-" + key + "\">" + label + "<small>" + hint + "</small></label><input id=\"setting-" + key + "\" type=\"checkbox\" data-setting=\"" + key + "\"" + (this.settings[key] ? " checked" : "") + "></div>";
    };
    const body =
      "<div class=\"settings-grid\">" +
        checkbox("audio", "Audio procédural", "Bourdonnement, signaux et menace.") +
        checkbox("captions", "Sous-titres sonores", "Affiche les indices audio importants.") +
        checkbox("reducedMotion", "Mouvement réduit", "Désactive secousses et pulsations fortes.") +
        checkbox("highContrast", "Lisibilité renforcée", "Accentue murs, repères et interface.") +
        checkbox("screenShake", "Secousses d’impact", "Effet visuel lors des attaques.") +
        checkbox("autoPause", "Pause automatique", "Suspend la partie si l’onglet est masqué.") +
        "<div class=\"setting-row\"><label for=\"setting-volume\">Volume général<small>Conservé sur cet appareil.</small></label><input id=\"setting-volume\" type=\"range\" min=\"0\" max=\"1\" step=\"0.05\" value=\"" + Number(this.settings.volume) + "\"></div>" +
      "</div>" +
      "<p><strong>Commandes :</strong> ZQSD/WASD ou flèches, Maj pour courir, C pour s’accroupir, F pour la lampe, E pour interagir, Espace pour l’impulsion, 1–3 pour les ressources.</p>";
    this.showModal({
      kind: "settings",
      eyebrow: "CONFORT DE JEU",
      title: "ACCESSIBILITÉ & OPTIONS",
      body,
      dismissible: !inGame,
      actions: [{
        label: inGame ? "Retour à la pause" : "Fermer",
        primary: true,
        action: () => {
          this.closeModal(false);
          if (inGame) this.openPauseDialog("PARTIE EN PAUSE");
        },
      }],
    });
    this.refs.modalBody.querySelectorAll("[data-setting]").forEach((input) => {
      input.addEventListener("change", () => {
        this.settings[input.dataset.setting] = input.checked;
        this.saveSettings();
      });
    });
    byId("setting-volume").addEventListener("input", (event) => {
      this.settings.volume = Number(event.currentTarget.value);
      this.saveSettings();
      this.audio.ensure();
    });
  }

  togglePause() {
    if (this.screen !== "game" || !this.run) {
      if (this.modalOpen && this.modalDismiss) this.modalDismiss();
      return;
    }
    if (this.modalOpen) {
      if (this.modalKind === "pause") {
        this.manualPaused = false;
        this.closeModal();
        this.refs.canvas.focus();
      }
      return;
    }
    this.manualPaused = true;
    this.input.clear();
    this.saveGame("PARTIE SAUVEGARDÉE");
    this.openPauseDialog("PARTIE EN PAUSE");
  }

  openPauseDialog(eyebrow) {
    this.showModal({
      kind: "pause",
      eyebrow,
      title: "LE BRUIT S’ARRÊTE",
      body:
        "<p>La simulation est suspendue. Votre position et l’état de la zone sont enregistrés sur cet appareil.</p>" +
        "<p>Session " + this.run.seed.toString(16).toUpperCase().slice(0, 8) + " · " + formatTime(this.run.stats.elapsed) + ".</p>",
      dismissible: false,
      actions: [
        {
          label: "Reprendre",
          primary: true,
          action: () => {
            this.manualPaused = false;
            this.closeModal();
            this.refs.canvas.focus();
          },
        },
        { label: "Options", action: () => this.openSettings() },
        {
          label: "Sauvegarder et quitter",
          action: () => {
            this.saveGame("PARTIE SAUVEGARDÉE");
            this.closeModal(false);
            this.showMenu();
          },
        },
      ],
    });
  }

  showModal({ kind, eyebrow, title, body, actions, dismissible = false }) {
    this.lastFocus = document.activeElement;
    this.modalKind = kind;
    this.modalOpen = true;
    this.modalDismiss = dismissible ? () => this.closeModal() : null;
    this.refs.modalEyebrow.textContent = eyebrow;
    this.refs.modalTitle.textContent = title;
    this.refs.modalBody.innerHTML = body;
    this.refs.modalActions.replaceChildren();
    actions.forEach((definition) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = definition.label;
      if (definition.primary) button.classList.add("primary");
      if (definition.danger) button.classList.add("danger");
      button.addEventListener("click", () => {
        this.audio.ensure();
        definition.action();
      });
      this.refs.modalActions.append(button);
    });
    this.refs.modal.hidden = false;
    this.refs.appFrame.inert = true;
    this.renderDirty = true;
    requestAnimationFrame(() => {
      const first = this.refs.modal.querySelector("input:checked, button, input, select");
      first?.focus();
    });
  }

  closeModal(restoreFocus = true) {
    this.refs.modal.hidden = true;
    this.refs.appFrame.inert = false;
    this.modalOpen = false;
    this.modalKind = "";
    this.modalDismiss = null;
    this.renderDirty = true;
    if (restoreFocus && this.lastFocus instanceof HTMLElement) this.lastFocus.focus();
  }

  trapModalFocus(event) {
    const focusable = [...this.refs.modal.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), [href]")];
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  announce(text) {
    this.refs.announcer.textContent = "";
    requestAnimationFrame(() => {
      this.refs.announcer.textContent = text;
    });
  }

  caption(text) {
    if (!this.settings.captions) return;
    this.refs.caption.textContent = text;
    this.refs.caption.hidden = false;
    this.captionTimer = 3.4;
  }

  log(text, kind = "") {
    this.logs.unshift({ text, kind });
    this.logs = this.logs.slice(0, LOG_LIMIT);
    const fragment = document.createDocumentFragment();
    this.logs.forEach((entry) => {
      const item = document.createElement("li");
      item.textContent = entry.text;
      if (entry.kind) item.className = entry.kind;
      fragment.append(item);
    });
    this.refs.eventLog.replaceChildren(fragment);
  }

  saveGame(label = "SAUVEGARDE AUTO") {
    if (!this.run || this.run.status !== "playing") return false;
    this.zone.explored = [...this.exploredSet];
    const saved = this.store.saveRun(this.run);
    this.refs.saveIndicator.textContent = saved ? label : "STOCKAGE INDISPONIBLE";
    window.clearTimeout(this.saveLabelTimer);
    this.saveLabelTimer = window.setTimeout(() => {
      this.refs.saveIndicator.textContent = "SAUVEGARDE PRÊTE";
    }, 1800);
    return saved;
  }

  resizeCanvas() {
    const cssWidth = this.refs.canvas.clientWidth || this.canvasWidth;
    const cssHeight = this.refs.canvas.clientHeight || this.canvasHeight;
    const cssScale = Math.min(cssWidth / this.canvasWidth, cssHeight / this.canvasHeight);
    const deviceScale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const ratio = Math.min(2, Math.max(.35, cssScale * deviceScale));
    this.pixelRatio = ratio;
    const targetWidth = Math.round(this.canvasWidth * ratio);
    const targetHeight = Math.round(this.canvasHeight * ratio);
    if (this.refs.canvas.width !== targetWidth || this.refs.canvas.height !== targetHeight) {
      this.refs.canvas.width = targetWidth;
      this.refs.canvas.height = targetHeight;
      this.renderDirty = true;
    }
  }

  loop(timestamp) {
    const dt = clamp((timestamp - this.lastFrame) / 1000, 0, .05);
    this.lastFrame = timestamp;
    const active = this.screen === "game" && this.run && !this.manualPaused && !this.modalOpen && !document.hidden;
    if (active) {
      this.update(dt);
      this.render();
      this.renderDirty = false;
    } else if (this.screen === "game" && this.run && this.renderDirty) {
      this.render();
      this.renderDirty = false;
    }
    requestAnimationFrame((next) => this.loop(next));
  }

  update(dt) {
    if (!this.zone || this.run.status !== "playing") return;
    const player = this.run.player;
    const stats = this.run.stats;
    const difficulty = DIFFICULTIES[this.run.difficulty];
    stats.elapsed += dt;
    this.uiClock += dt;
    this.saveClock += dt;
    this.captionTimer -= dt;
    this.hazardCooldown = Math.max(0, this.hazardCooldown - dt);
    this.ambientClock -= dt;
    this.screenFlash = Math.max(0, this.screenFlash - dt * 1.9);
    this.screenShake = Math.max(0, this.screenShake - dt * 2.8);

    if (this.captionTimer <= 0) this.refs.caption.hidden = true;
    if (this.input.consume("KeyF")) this.toggleFlashlight();
    if (this.input.consume("Space")) this.pulse();
    if (this.input.consume("KeyE")) this.interact();
    if (this.input.consume("Digit1")) this.useResource("battery");
    if (this.input.consume("Digit2")) this.useResource("medkit");
    if (this.input.consume("Digit3")) this.useResource("stabilizer");
    if (this.manualPaused || this.modalOpen || this.run.status !== "playing") {
      this.input.endFrame();
      return;
    }

    let dx = (this.input.is("ArrowRight", "KeyD") ? 1 : 0) - (this.input.is("ArrowLeft", "KeyA", "KeyQ") ? 1 : 0);
    let dy = (this.input.is("ArrowDown", "KeyS") ? 1 : 0) - (this.input.is("ArrowUp", "KeyW", "KeyZ") ? 1 : 0);
    const length = Math.hypot(dx, dy);
    if (length > 0) {
      dx /= length;
      dy /= length;
    }

    player.crouching = this.input.is("KeyC");
    const sprinting = length > 0 && !player.crouching && this.input.is("ShiftLeft", "ShiftRight") && player.stamina > 2;
    let speed = 2.7;
    if (sprinting) speed *= 1.58;
    if (player.crouching) speed *= .56;
    if (player.composure < 20) speed *= .92;

    const beforeX = player.x;
    const beforeY = player.y;
    if (length > 0) {
      this.movePlayer(dx * speed * dt, dy * speed * dt);
      if (player.hidden) {
        player.hidden = false;
        this.log("Vous quittez la cache.", "");
      }
    }
    const moved = distance(beforeX, beforeY, player.x, player.y);
    let noise = 0;
    if (moved > .0001) {
      stats.steps += moved;
      noise = sprinting ? 1 : player.crouching ? .12 : .42;
      if (sprinting) player.stamina = clamp(player.stamina - dt * 23, 0, 100);
      else player.stamina = clamp(player.stamina + dt * 9, 0, 100);
    } else {
      player.stamina = clamp(player.stamina + dt * 15, 0, 100);
    }

    if (player.flashlight && player.battery > 0) {
      player.battery = clamp(player.battery - dt * (.26 + this.run.zoneIndex * .055) * difficulty.batteryDrain, 0, 100);
      if (player.battery <= 0) {
        player.flashlight = false;
        this.log("La lampe s’éteint. Le bourdonnement change de fréquence.", "danger");
        this.caption("Déclic sec. La lampe n’a plus de charge.");
        this.audio.cue("empty");
      }
    }
    player.pulse = clamp(player.pulse + dt * (player.flashlight ? 3.3 : 4.6), 0, 100);

    this.revealAroundPlayer(player.flashlight ? 4.8 + player.battery / 45 : 2.3);
    const hazard = this.zone.hazards.find((item) => distance(player.x, player.y, item.x + .5, item.y + .5) < .48);
    if (hazard && moved > 0 && this.hazardCooldown <= 0) {
      this.hazardCooldown = 1.8;
      noise = Math.max(noise, 1.15);
      player.composure = clamp(player.composure - 1.5, 0, 100);
      this.caption(this.run.zoneIndex === 1 ? "Éclaboussure métallique sous vos pas." : "La surface craque beaucoup trop fort.");
    }

    const nearest = this.updateThreats(dt, noise);
    if (player.hidden) {
      player.composure = clamp(player.composure + dt * 2.3, 0, 100);
    } else if (nearest.distance < 6) {
      const pressure = clamp(1 - nearest.distance / 6, 0, 1);
      player.composure = clamp(player.composure - dt * pressure * (nearest.state === "chase" ? 7.5 : 2.8), 0, 100);
    } else if (!player.flashlight) {
      player.composure = clamp(player.composure - dt * .26, 0, 100);
    } else {
      player.composure = clamp(player.composure + dt * .38, 0, 100);
    }

    this.updateInteraction();
    this.audio.update(nearest.distance, nearest.state);
    this.updateThreatAnnouncements(nearest);

    if (this.ambientClock <= 0) {
      this.ambientClock = 12 + Math.random() * 14;
      if (nearest.state !== "chase") {
        const messages = [
          "Un tube fluorescent s’allume derrière vous.",
          "Une porte se ferme deux couloirs plus loin.",
          "Le bourdonnement saute un battement.",
          "Des pas imitent votre dernier trajet.",
        ];
        this.caption(messages[Math.floor(Math.random() * messages.length)]);
        this.audio.noise(.16, .025, 720);
      }
    }

    if (player.health <= 0) {
      this.failRun("consumed");
      this.input.endFrame();
      return;
    }
    if (player.composure <= 0) {
      this.failRun("lost");
      this.input.endFrame();
      return;
    }

    if (this.uiClock >= .14) {
      this.uiClock = 0;
      this.updateUi();
    }
    if (this.saveClock >= 9) {
      this.saveClock = 0;
      this.saveGame();
    }
    this.input.endFrame();
  }

  movePlayer(dx, dy) {
    const player = this.run.player;
    const radius = .27;
    const canStand = (x, y) => {
      return isWalkable(this.zone.grid, x - radius, y - radius) &&
        isWalkable(this.zone.grid, x + radius, y - radius) &&
        isWalkable(this.zone.grid, x - radius, y + radius) &&
        isWalkable(this.zone.grid, x + radius, y + radius);
    };
    if (canStand(player.x + dx, player.y)) player.x += dx;
    if (canStand(player.x, player.y + dy)) player.y += dy;
  }

  revealAroundPlayer(radius) {
    const player = this.run.player;
    const left = Math.floor(player.x - radius);
    const right = Math.ceil(player.x + radius);
    const top = Math.floor(player.y - radius);
    const bottom = Math.ceil(player.y + radius);
    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        if (!isWalkable(this.zone.grid, x, y)) continue;
        if (distance(player.x, player.y, x + .5, y + .5) > radius) continue;
        if (!hasLineOfSight(this.zone.grid, player, { x: x + .5, y: y + .5 })) continue;
        const key = x + "," + y;
        if (!this.exploredSet.has(key)) {
          this.exploredSet.add(key);
          this.renderDirty = true;
        }
      }
    }
  }

  updateThreats(dt, noise) {
    const player = this.run.player;
    const difficulty = DIFFICULTIES[this.run.difficulty];
    let nearest = { distance: 999, state: "patrol", threat: null };
    this.zone.threats.forEach((threat, index) => {
      threat.cooldown = Math.max(0, threat.cooldown - dt);
      threat.pathTimer = Math.max(0, threat.pathTimer - dt);
      threat.stun = Math.max(0, threat.stun - dt);
      const currentDistance = distance(player.x, player.y, threat.x, threat.y);
      if (currentDistance < nearest.distance) nearest = { distance: currentDistance, state: threat.state, threat };
      if (threat.stun > 0) {
        threat.state = "stunned";
        return;
      }

      const lightRange = player.flashlight ? 8.8 : 4.2;
      const seesPlayer = !player.hidden && currentDistance < lightRange && hasLineOfSight(this.zone.grid, threat, player);
      const hearsPlayer = !player.hidden && noise > .1 && currentDistance < 2.8 + noise * 8.4;
      if (seesPlayer) {
        threat.state = "chase";
        threat.alert = 100;
        threat.lastKnown = { x: player.x, y: player.y };
        threat.lostSight = 0;
      } else if (hearsPlayer) {
        threat.state = "investigate";
        threat.alert = Math.max(threat.alert, 62);
        threat.lastKnown = { x: player.x, y: player.y };
      } else {
        threat.alert = Math.max(0, threat.alert - dt * 12);
        threat.lostSight = (threat.lostSight || 0) + dt;
        if (threat.state === "chase" && threat.lostSight > 2.7) threat.state = "investigate";
        if (threat.state === "investigate" && threat.alert <= 0) {
          threat.state = "patrol";
          threat.target = null;
        }
        if (threat.state === "stunned") threat.state = "patrol";
      }

      let target = null;
      if (threat.state === "chase") target = player;
      else if (threat.state === "investigate") target = threat.lastKnown;
      else {
        if (!threat.target || distance(threat.x, threat.y, threat.target.x, threat.target.y) < .8) {
          threat.target = this.randomPatrolTarget(threat, index);
        }
        target = threat.target;
      }

      if (target) {
        if (threat.pathTimer <= 0 || !Array.isArray(threat.path) || threat.path.length < 2) {
          threat.path = findPath(this.zone.grid, threat, target);
          threat.pathTimer = threat.state === "chase" ? .35 : .75;
        }
        this.followThreatPath(threat, target, dt, difficulty);
      }

      const afterDistance = distance(player.x, player.y, threat.x, threat.y);
      if (afterDistance < nearest.distance) nearest = { distance: afterDistance, state: threat.state, threat };
      if (afterDistance < .72 && threat.cooldown <= 0 && (!player.hidden || threat.alert > 82)) {
        if (player.hidden) {
          player.hidden = false;
          this.log("La cache s’ouvre de l’extérieur.", "danger");
        }
        this.attackPlayer(threat);
      }
    });
    return nearest;
  }

  randomPatrolTarget(threat, salt) {
    const width = this.zone.grid[0].length;
    const height = this.zone.grid.length;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const x = 1 + Math.floor(Math.random() * (width - 2));
      const y = 1 + Math.floor(Math.random() * (height - 2));
      if (!isWalkable(this.zone.grid, x, y)) continue;
      if (distance(threat.x, threat.y, x + .5, y + .5) < 5 + salt) continue;
      return { x: x + .5, y: y + .5 };
    }
    return { x: this.zone.exit.x, y: this.zone.exit.y };
  }

  followThreatPath(threat, target, dt, difficulty) {
    let destination = target;
    if (Array.isArray(threat.path) && threat.path.length > 1) {
      while (threat.path.length > 1 && distance(threat.x, threat.y, threat.path[1].x + .5, threat.path[1].y + .5) < .38) {
        threat.path.shift();
      }
      if (threat.path[1]) destination = { x: threat.path[1].x + .5, y: threat.path[1].y + .5 };
    }
    const span = Math.max(.001, distance(threat.x, threat.y, destination.x, destination.y));
    const stateSpeed = threat.state === "chase" ? 1.72 : threat.state === "investigate" ? 1.12 : .72;
    const speed = stateSpeed * difficulty.threatSpeed * (1 + this.run.zoneIndex * .08);
    const dx = (destination.x - threat.x) / span * speed * dt;
    const dy = (destination.y - threat.y) / span * speed * dt;
    const radius = .22;
    const canStand = (x, y) => {
      return isWalkable(this.zone.grid, x - radius, y - radius) &&
        isWalkable(this.zone.grid, x + radius, y - radius) &&
        isWalkable(this.zone.grid, x - radius, y + radius) &&
        isWalkable(this.zone.grid, x + radius, y + radius);
    };
    if (canStand(threat.x + dx, threat.y)) threat.x += dx;
    if (canStand(threat.x, threat.y + dy)) threat.y += dy;
  }

  attackPlayer(threat) {
    const player = this.run.player;
    const difficulty = DIFFICULTIES[this.run.difficulty];
    const damage = (13 + this.run.zoneIndex * 4) * difficulty.damage;
    player.health = clamp(player.health - damage, 0, 100);
    player.composure = clamp(player.composure - 9, 0, 100);
    player.battery = clamp(player.battery - 7, 0, 100);
    this.run.stats.damageTaken += damage;
    this.run.stats.encounters += 1;
    threat.cooldown = 1.45;
    threat.stun = .55;
    threat.alert = 100;
    const span = Math.max(.01, distance(player.x, player.y, threat.x, threat.y));
    const pushX = (threat.x - player.x) / span * .8;
    const pushY = (threat.y - player.y) / span * .8;
    if (isWalkable(this.zone.grid, threat.x + pushX, threat.y)) threat.x += pushX;
    if (isWalkable(this.zone.grid, threat.x, threat.y + pushY)) threat.y += pushY;
    this.screenFlash = 1;
    if (this.settings.screenShake && !this.settings.reducedMotion) this.screenShake = 1;
    this.log(ZONE_DEFS[this.run.zoneIndex].threatName + " vous atteint.", "danger");
    this.caption("Impact violent. Une respiration étrangère contre votre oreille.");
    this.audio.cue("attack");
    this.announce("Attaque. Santé " + Math.round(player.health) + " pour cent.");
    this.renderDirty = true;
  }

  updateThreatAnnouncements(nearest) {
    const band = nearest.state === "chase" || nearest.distance < 2.5
      ? "danger"
      : nearest.state === "investigate" || nearest.distance < 6
        ? "near"
        : "quiet";
    if (band === this.previousThreatBand) return;
    this.previousThreatBand = band;
    if (band === "danger") {
      this.announce("Menace immédiate. Courez, cachez-vous ou utilisez l’impulsion.");
      this.caption("Le bourdonnement est couvert par des pas.");
    } else if (band === "near") {
      this.announce("Une menace inspecte les couloirs proches.");
      this.caption("Quelque chose s’arrête pour écouter.");
    } else {
      this.announce("La menace s’éloigne.");
    }
  }

  updateInteraction() {
    const player = this.run.player;
    let interaction = null;
    if (player.hidden) {
      interaction = { type: "leave-hide", label: "Quitter la cache" };
    } else {
      const item = this.zone.items
        .filter((entry) => !entry.collected)
        .map((entry) => ({ entry, span: distance(player.x, player.y, entry.x + .5, entry.y + .5) }))
        .sort((a, b) => a.span - b.span)[0];
      if (item && item.span < 1.2) {
        const labels = {
          objective: "Restaurer le relais",
          note: "Lire la note",
          battery: "Ramasser la pile",
          medkit: "Ramasser les soins",
          stabilizer: "Ramasser le calmant",
        };
        interaction = { type: "item", item: item.entry, label: labels[item.entry.type] };
      }
      if (!interaction) {
        const hiding = this.zone.hidingSpots
          .map((entry) => ({ entry, span: distance(player.x, player.y, entry.x + .5, entry.y + .5) }))
          .sort((a, b) => a.span - b.span)[0];
        if (hiding && hiding.span < 1.15) interaction = { type: "hide", spot: hiding.entry, label: "Se cacher dans l’alcôve" };
      }
      const exitDistance = distance(player.x, player.y, this.zone.exit.x, this.zone.exit.y);
      if (exitDistance < 1.3) {
        interaction = {
          type: "exit",
          label: this.zone.objectivesFound >= this.zone.requiredCount ? "Franchir le seuil" : "Examiner la sortie verrouillée",
        };
      }
    }
    const oldKey = this.pendingInteraction ? this.pendingInteraction.type + ":" + (this.pendingInteraction.item?.id || "") : "";
    const newKey = interaction ? interaction.type + ":" + (interaction.item?.id || "") : "";
    this.pendingInteraction = interaction;
    if (oldKey !== newKey) {
      this.refs.interactionPrompt.hidden = !interaction;
      if (interaction) this.refs.interactionText.textContent = interaction.label;
    }
  }

  interact() {
    const interaction = this.pendingInteraction;
    if (!interaction || !this.run || this.modalOpen) return;
    if (interaction.type === "leave-hide") {
      this.run.player.hidden = false;
      this.log("Vous quittez la cache.");
    } else if (interaction.type === "hide") {
      this.run.player.hidden = true;
      this.run.player.flashlight = false;
      this.log("Vous retenez votre souffle dans l’alcôve.");
      this.caption("Le monde devient étroit et presque silencieux.");
    } else if (interaction.type === "item") {
      this.collectItem(interaction.item);
    } else if (interaction.type === "exit") {
      this.useExit();
    }
    this.updateInteraction();
    this.updateUi(true);
  }

  collectItem(item) {
    if (item.collected) return;
    item.collected = true;
    const player = this.run.player;
    if (item.type === "objective") {
      this.zone.objectivesFound += 1;
      this.run.stats.objectives += 1;
      this.log("Relais restauré : " + this.zone.objectivesFound + "/" + this.zone.requiredCount + ".", "good");
      this.caption("Le néon se stabilise. Un verrou cède au loin.");
      this.audio.cue("objective");
      this.announce("Objectif restauré. " + this.zone.objectivesFound + " sur " + this.zone.requiredCount + ".");
    } else if (item.type === "note") {
      this.run.stats.notes += 1;
      this.log(item.label + " — " + item.text, "good");
      this.caption("Papier humide. L’encre semble encore fraîche.");
      this.audio.cue("note");
      this.announce("Note trouvée. " + this.run.stats.notes + " sur 3.");
    } else {
      player.inventory[item.type] = (player.inventory[item.type] || 0) + 1;
      this.run.stats.resources += 1;
      const labels = { battery: "Pile industrielle", medkit: "Trousse scellée", stabilizer: "Calmant sans marque" };
      this.log(labels[item.type] + " ajouté au sac.", "good");
      this.audio.cue("pickup");
    }
    this.saveGame("OBJET ENREGISTRÉ");
    this.renderDirty = true;
  }

  useExit() {
    if (this.zone.objectivesFound < this.zone.requiredCount) {
      const missing = this.zone.requiredCount - this.zone.objectivesFound;
      this.log("Le seuil reste verrouillé : " + missing + " relais manque" + (missing > 1 ? "nt" : "") + ".", "danger");
      this.audio.cue("empty");
      this.announce("Sortie verrouillée. " + missing + " objectif restant.");
      return;
    }
    if (this.run.zoneIndex < ZONE_DEFS.length - 1) {
      this.zone.completed = true;
      this.saveGame("ZONE TERMINÉE");
      this.audio.cue("door");
      this.manualPaused = true;
      const nextIndex = this.run.zoneIndex + 1;
      this.showModal({
        kind: "transition",
        eyebrow: "SEUIL " + (this.run.zoneIndex + 1) + "/3",
        title: "LE PASSAGE S’OUVRE",
        body:
          "<p>La sortie ne mène pas dehors. De l’autre côté, <strong>" + ZONE_DEFS[nextIndex].shortName + "</strong> attend déjà votre arrivée.</p>" +
          "<p>Santé : " + Math.round(this.run.player.health) + " % · Batterie : " + Math.round(this.run.player.battery) + " % · Notes : " + this.run.stats.notes + "/3.</p>",
        dismissible: false,
        actions: [{
          label: "Franchir",
          primary: true,
          action: () => {
            this.closeModal(false);
            this.enterZone(nextIndex, true);
            this.manualPaused = false;
            this.refs.canvas.focus();
          },
        }],
      });
    } else {
      this.openFinalChoice();
    }
  }

  openFinalChoice() {
    this.zone.completed = true;
    this.saveGame("DERNIER SEUIL");
    this.audio.cue("door");
    this.manualPaused = true;
    const available = unlockedFinalEndings(this.run);
    const body =
      "<p>L’ascenseur attend, portes ouvertes. Le bouton porte le numéro de votre session.</p>" +
      (available.includes("cartographer") ? "<p>Les trois notes vibrent ensemble dans votre poche.</p>" : "") +
      (available.includes("silent") ? "<p>La menace n’a jamais réussi à vous toucher. Le lieu ignore encore votre nom.</p>" : "");
    const actions = [{
      label: "Descendre vers la sortie",
      primary: true,
      action: () => this.finishVictory("escape"),
    }];
    if (available.includes("cartographer")) {
      actions.push({ label: "Suivre le plan impossible", action: () => this.finishVictory("cartographer") });
    }
    if (available.includes("silent")) {
      actions.push({ label: "Éteindre le dernier néon", action: () => this.finishVictory("silent") });
    }
    this.showModal({
      kind: "final-choice",
      eyebrow: "DERNIÈRE DÉCISION",
      title: "QUELLE SORTIE PRENDRE ?",
      body,
      dismissible: false,
      actions,
    });
  }

  finishVictory(endingId) {
    const ending = ENDINGS[endingId];
    const score = scoreRun(this.run);
    this.run.status = "completed";
    this.profile.runs += 1;
    this.profile.bestScore = Math.max(this.profile.bestScore, score);
    if (!this.profile.endings.includes(endingId)) this.profile.endings.push(endingId);
    this.store.saveProfile(this.profile);
    this.store.clearActive();
    this.manualPaused = true;
    this.audio.tone(110, .8, "triangle", .08, 190);
    this.showModal({
      kind: "victory",
      eyebrow: ending.rank + " · ISSUE CONSIGNÉE",
      title: ending.title,
      body:
        "<p>" + ending.text + "</p>" +
        "<p>Score : <strong>" + score.toLocaleString("fr-FR") + "</strong> · Temps : " + formatTime(this.run.stats.elapsed) + " · Rencontres : " + this.run.stats.encounters + " · Notes : " + this.run.stats.notes + "/3.</p>",
      dismissible: false,
      actions: [
        { label: "Nouvelle descente", primary: true, action: () => { this.closeModal(false); this.showMenu(); this.openNewGameDialog(); } },
        { label: "Voir les archives", action: () => { this.closeModal(false); this.showMenu(); this.openArchives(); } },
        { label: "Menu principal", action: () => { this.closeModal(false); this.showMenu(); } },
      ],
    });
    this.announce("Victoire. " + ending.rank + ", " + ending.title + ".");
  }

  failRun(endingId) {
    if (!this.run || this.run.status !== "playing") return;
    const ending = ENDINGS[endingId];
    this.run.status = "failed";
    this.profile.failures += 1;
    if (!this.profile.endings.includes(endingId)) this.profile.endings.push(endingId);
    this.store.saveProfile(this.profile);
    this.store.clearRun();
    this.manualPaused = true;
    this.audio.cue("attack");
    const checkpoint = this.store.loadCheckpoint();
    const actions = [];
    if (checkpoint) {
      actions.push({ label: "Reprendre au dernier seuil", primary: true, action: () => this.resumeCheckpoint() });
    }
    actions.push({ label: "Nouvelle descente", action: () => { this.closeModal(false); this.showMenu(); this.openNewGameDialog(); } });
    actions.push({ label: "Menu principal", action: () => { this.closeModal(false); this.showMenu(); } });
    this.showModal({
      kind: "failure",
      eyebrow: ending.rank + " · SIGNAL PERDU",
      title: ending.title,
      body:
        "<p>" + ending.text + "</p>" +
        "<p>Temps tenu : " + formatTime(this.run.stats.elapsed) + " · Relais : " + this.run.stats.objectives + " · Rencontres : " + this.run.stats.encounters + ".</p>",
      dismissible: false,
      actions,
    });
    this.announce("Échec. " + ending.title + ".");
  }

  resumeCheckpoint() {
    const checkpoint = this.store.loadCheckpoint();
    if (!checkpoint) {
      this.closeModal(false);
      this.showMenu();
      return;
    }
    checkpoint.stats.retries = (checkpoint.stats.retries || 0) + 1;
    checkpoint.status = "playing";
    this.run = checkpoint;
    this.closeModal(false);
    this.showGame();
    this.restoreZone();
    this.saveGame("CHECKPOINT REPRIS");
    this.manualPaused = false;
    this.log("Le seuil vous rejette une seconde fois.", "danger");
    this.refs.canvas.focus();
  }

  toggleFlashlight() {
    if (!this.run || this.modalOpen) return;
    const player = this.run.player;
    if (!player.flashlight && player.battery <= 0) {
      this.log("La lampe n’a plus de charge.", "danger");
      this.audio.cue("empty");
      return;
    }
    player.flashlight = !player.flashlight;
    this.log(player.flashlight ? "Lampe allumée. Vous êtes plus visible." : "Lampe éteinte. Vos contours disparaissent.");
    this.caption(player.flashlight ? "Le ballast grésille puis tient." : "Le bourdonnement paraît soudain plus loin.");
    this.renderDirty = true;
  }

  pulse() {
    if (!this.run || this.modalOpen) return;
    const player = this.run.player;
    if (player.pulse < 99.5) {
      this.log("L’impulsion n’est pas encore chargée.");
      this.audio.cue("empty");
      return;
    }
    player.pulse = 0;
    player.battery = clamp(player.battery - 4, 0, 100);
    this.run.stats.pulseUses += 1;
    let affected = 0;
    this.zone.threats.forEach((threat) => {
      const span = distance(player.x, player.y, threat.x, threat.y);
      if (span > 6.5 || !hasLineOfSight(this.zone.grid, player, threat)) return;
      threat.stun = 3.2;
      threat.state = "stunned";
      threat.alert = 28;
      threat.path = [];
      const dx = (threat.x - player.x) / Math.max(.01, span);
      const dy = (threat.y - player.y) / Math.max(.01, span);
      const originX = threat.x;
      const originY = threat.y;
      for (let step = .2; step <= 2.2; step += .2) {
        const x = originX + dx * step;
        const y = originY + dy * step;
        if (!isWalkable(this.zone.grid, x, y)) break;
        threat.x = x;
        threat.y = y;
      }
      affected += 1;
    });
    this.screenFlash = .7;
    if (this.settings.screenShake && !this.settings.reducedMotion) this.screenShake = .45;
    this.audio.cue("pulse");
    this.log(affected ? "L’impulsion brise la poursuite." : "L’impulsion se perd dans les cloisons.", affected ? "good" : "");
    this.caption("Décharge blanche. " + (affected ? "La silhouette recule." : "Aucune réponse."));
    this.renderDirty = true;
  }

  useResource(type) {
    if (!this.run || this.modalOpen) return;
    const inventory = this.run.player.inventory;
    if (!inventory[type]) {
      this.audio.cue("empty");
      return;
    }
    const player = this.run.player;
    if (type === "battery") {
      if (player.battery >= 96) return;
      inventory.battery -= 1;
      player.battery = clamp(player.battery + 48, 0, 100);
      this.log("Une pile neuve remplace la cellule chaude.", "good");
    } else if (type === "medkit") {
      if (player.health >= 98) return;
      inventory.medkit -= 1;
      player.health = clamp(player.health + 38, 0, 100);
      this.log("Vous refermez les plaies sans regarder leur forme.", "good");
    } else if (type === "stabilizer") {
      if (player.composure >= 98) return;
      inventory.stabilizer -= 1;
      player.composure = clamp(player.composure + 42, 0, 100);
      this.log("Le tremblement ralentit. Les murs redeviennent parallèles.", "good");
    }
    this.audio.cue("pickup");
    this.saveGame("RESSOURCE UTILISÉE");
    this.updateUi(true);
  }

  performAction(action) {
    if (this.screen !== "game" || this.modalOpen || this.manualPaused) return;
    if (action === "interact") this.interact();
    else if (action === "flashlight") this.toggleFlashlight();
    else if (action === "pulse") this.pulse();
  }

  updateUi(force = false) {
    if (!this.run || !this.zone) return;
    const player = this.run.player;
    const definition = ZONE_DEFS[this.run.zoneIndex];
    this.refs.zoneName.textContent = definition.name;
    const missing = this.zone.requiredCount - this.zone.objectivesFound;
    this.refs.objectiveText.textContent = missing > 0
      ? "Restaurez encore " + missing + " " + definition.objectiveName + ", puis localisez la sortie."
      : "Tous les relais répondent. La sortie est maintenant déverrouillée.";
    const progressMarkup = Array.from({ length: this.zone.requiredCount }, (_, index) => {
      return "<i class=\"" + (index < this.zone.objectivesFound ? "found" : "") + "\"></i>";
    }).join("");
    if (force || this.refs.objectiveProgress.innerHTML !== progressMarkup) this.refs.objectiveProgress.innerHTML = progressMarkup;
    this.refs.objectiveProgress.setAttribute("aria-valuemax", String(this.zone.requiredCount));
    this.refs.objectiveProgress.setAttribute("aria-valuenow", String(this.zone.objectivesFound));
    this.refs.objectiveProgress.setAttribute("aria-valuetext", this.zone.objectivesFound + " relais restauré" + (this.zone.objectivesFound > 1 ? "s" : "") + " sur " + this.zone.requiredCount);

    this.setVital("health", player.health);
    this.setVital("battery", player.battery);
    this.setVital("stamina", player.stamina);
    this.setVital("composure", player.composure);
    this.refs.batteryCount.textContent = player.inventory.battery;
    this.refs.medkitCount.textContent = player.inventory.medkit;
    this.refs.stabilizerCount.textContent = player.inventory.stabilizer;
    document.querySelector("[data-use=battery]").disabled = player.inventory.battery <= 0 || player.battery >= 96;
    document.querySelector("[data-use=medkit]").disabled = player.inventory.medkit <= 0 || player.health >= 98;
    document.querySelector("[data-use=stabilizer]").disabled = player.inventory.stabilizer <= 0 || player.composure >= 98;
    this.refs.pulseValue.textContent = Math.round(player.pulse) + " %";
    this.refs.pulseButton.disabled = player.pulse < 99.5;
    this.refs.pulseButton.classList.toggle("ready", player.pulse >= 99.5);

    const nearest = this.nearestThreat();
    const proximity = clamp(100 - nearest.distance * 10, 0, 100);
    const stateLabels = { patrol: "ERRATIQUE", investigate: "À L’ÉCOUTE", chase: "POURSUITE", stunned: "REPOUSSÉE" };
    const threatLabel = stateLabels[nearest.state] || "INCONNUE";
    if (this.refs.threatState.textContent !== threatLabel) this.refs.threatState.textContent = threatLabel;
    this.refs.threatMeter.style.width = proximity + "%";
    const threatHint = nearest.state === "chase"
      ? "La menace a votre trace. Rompez la ligne de vue."
      : nearest.state === "investigate"
        ? "Elle inspecte votre dernier bruit."
        : nearest.distance < 7
          ? "Un signal irrégulier traverse les murs proches."
          : "Le bourdonnement masque les distances.";
    if (this.refs.threatHint.textContent !== threatHint) this.refs.threatHint.textContent = threatHint;
    const danger = this.settings.reducedMotion ? clamp((proximity - 55) / 100, 0, .25) : clamp((proximity - 45) / 75, 0, .68);
    this.refs.dangerSignal.style.setProperty("--danger-opacity", String(danger));

    const target = this.navigationTarget();
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const targetName = target.type === "exit" ? "sortie" : "relais";
    const canvasDescription =
      "Zone " + (this.run.zoneIndex + 1) + " sur 3. " +
      targetName + " à environ " + Math.round(Math.hypot(dx, dy)) + " mètres vers le " + directionLabel(dx, dy) + ". " +
      "Menace " + this.refs.threatState.textContent.toLowerCase() + ". Santé " + Math.round(player.health) + " pour cent, batterie " + Math.round(player.battery) + " pour cent.";
    if (this.refs.canvasDescription.textContent !== canvasDescription) this.refs.canvasDescription.textContent = canvasDescription;
  }

  setVital(name, value) {
    const rounded = Math.round(value);
    this.refs[name + "Value"].textContent = rounded;
    this.refs[name + "Meter"].value = rounded;
    this.refs[name + "Meter"].textContent = rounded + " %";
    this.refs[name + "Meter"].parentElement.classList.toggle("critical", value < 25);
  }

  nearestThreat() {
    if (!this.zone || !this.zone.threats.length) return { distance: 99, state: "patrol", threat: null };
    return this.zone.threats
      .map((threat) => ({ distance: distance(this.run.player.x, this.run.player.y, threat.x, threat.y), state: threat.state, threat }))
      .sort((a, b) => a.distance - b.distance)[0];
  }

  navigationTarget() {
    const player = this.run.player;
    const objectives = this.zone.items
      .filter((item) => item.type === "objective" && !item.collected)
      .map((item) => ({ x: item.x + .5, y: item.y + .5, type: "objective", span: distance(player.x, player.y, item.x + .5, item.y + .5) }))
      .sort((a, b) => a.span - b.span);
    return objectives[0] || { ...this.zone.exit, type: "exit" };
  }

  render() {
    if (!this.zone || !this.run) return;
    const context = this.context;
    const ratio = this.pixelRatio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const width = this.canvasWidth;
    const height = this.canvasHeight;
    const definition = ZONE_DEFS[this.run.zoneIndex];
    const palette = definition.palette;
    context.fillStyle = palette.void;
    context.fillRect(0, 0, width, height);

    const tileSize = 58;
    const worldWidth = this.zone.grid[0].length * tileSize;
    const worldHeight = this.zone.grid.length * tileSize;
    const shakeAmount = this.settings.reducedMotion ? 0 : this.screenShake * 9;
    const shakeX = shakeAmount ? (Math.random() - .5) * shakeAmount : 0;
    const shakeY = shakeAmount ? (Math.random() - .5) * shakeAmount : 0;
    const cameraX = clamp(this.run.player.x * tileSize - width / 2, 0, Math.max(0, worldWidth - width)) + shakeX;
    const cameraY = clamp(this.run.player.y * tileSize - height / 2, 0, Math.max(0, worldHeight - height)) + shakeY;
    const left = Math.max(0, Math.floor(cameraX / tileSize) - 1);
    const right = Math.min(this.zone.grid[0].length - 1, Math.ceil((cameraX + width) / tileSize) + 1);
    const top = Math.max(0, Math.floor(cameraY / tileSize) - 1);
    const bottom = Math.min(this.zone.grid.length - 1, Math.ceil((cameraY + height) / tileSize) + 1);

    for (let y = top; y <= bottom; y += 1) {
      for (let x = left; x <= right; x += 1) {
        const screenX = x * tileSize - cameraX;
        const screenY = y * tileSize - cameraY;
        const wall = this.zone.grid[y][x] === "#";
        if (wall) this.drawWall(context, screenX, screenY, tileSize, palette, x, y);
        else this.drawFloor(context, screenX, screenY, tileSize, palette, x, y);
      }
    }

    this.zone.hazards.forEach((hazard) => {
      if (!this.isVisibleCell(hazard.x, hazard.y, left, right, top, bottom)) return;
      const x = hazard.x * tileSize - cameraX;
      const y = hazard.y * tileSize - cameraY;
      context.fillStyle = this.run.zoneIndex === 1 ? "rgba(104, 213, 232, .18)" : "rgba(32, 27, 15, .32)";
      context.beginPath();
      context.ellipse(x + tileSize * .5, y + tileSize * .66, tileSize * .36, tileSize * .13, 0, 0, TWO_PI);
      context.fill();
    });

    this.zone.landmarks.forEach((landmark) => {
      if (!this.isVisibleCell(landmark.x, landmark.y, left, right, top, bottom)) return;
      this.drawLandmark(context, landmark, tileSize, cameraX, cameraY, palette);
    });
    this.zone.hidingSpots.forEach((spot) => {
      if (!this.isVisibleCell(spot.x, spot.y, left, right, top, bottom)) return;
      this.drawHidingSpot(context, spot, tileSize, cameraX, cameraY, palette);
    });
    this.zone.items.forEach((item) => {
      if (item.collected || !this.isVisibleCell(item.x, item.y, left, right, top, bottom)) return;
      this.drawItem(context, item, tileSize, cameraX, cameraY, palette);
    });
    this.drawExit(context, tileSize, cameraX, cameraY, palette);
    this.zone.threats.forEach((threat, index) => this.drawThreat(context, threat, index, tileSize, cameraX, cameraY, palette));
    this.drawPlayer(context, tileSize, cameraX, cameraY, palette);
    this.drawDarkness(context, tileSize, cameraX, cameraY, palette);
    this.drawNavigation(context, palette);
    this.drawMinimap(context, palette);
    this.drawCanvasStatus(context, palette);

    if (this.screenFlash > 0) {
      context.fillStyle = "rgba(255, 34, 50, " + (this.screenFlash * .22) + ")";
      context.fillRect(0, 0, width, height);
    }
    const vignette = context.createRadialGradient(width / 2, height / 2, 160, width / 2, height / 2, width * .72);
    vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
    vignette.addColorStop(1, "rgba(0, 0, 0, .68)");
    context.fillStyle = vignette;
    context.fillRect(0, 0, width, height);
  }

  isVisibleCell(x, y, left, right, top, bottom) {
    return x >= left && x <= right && y >= top && y <= bottom;
  }

  drawFloor(context, x, y, size, palette, gridX, gridY) {
    const alternate = (gridX * 17 + gridY * 31 + this.zone.seed) % 7 < 2;
    context.fillStyle = alternate ? palette.floorAlt : palette.floor;
    context.fillRect(x, y, size + 1, size + 1);
    context.strokeStyle = this.settings.highContrast ? "rgba(255, 255, 255, .13)" : "rgba(0, 0, 0, .17)";
    context.lineWidth = 1;
    context.strokeRect(x + .5, y + .5, size - 1, size - 1);
    if (this.run.zoneIndex === 0) {
      context.fillStyle = "rgba(48, 38, 10, .13)";
      context.fillRect(x + ((gridX * 13) % 21), y + ((gridY * 11) % 28), 2, 18);
    } else if (this.run.zoneIndex === 1) {
      const wave = this.settings.reducedMotion ? 0 : Math.sin(this.run.stats.elapsed * 1.4 + gridX + gridY) * 3;
      context.fillStyle = "rgba(108, 218, 238, .09)";
      context.fillRect(x, y + size * .6 + wave, size, size * .18);
    } else {
      context.fillStyle = "rgba(255, 177, 171, .06)";
      context.fillRect(x, y + size * .46, size, 2);
    }
  }

  drawWall(context, x, y, size, palette, gridX, gridY) {
    context.fillStyle = palette.wall;
    context.fillRect(x, y, size + 1, size + 1);
    context.fillStyle = "rgba(0, 0, 0, .23)";
    context.fillRect(x + 6, y + 8, size - 12, size - 12);
    context.fillStyle = "rgba(255, 255, 255, .055)";
    context.fillRect(x + 6, y + 6, size - 12, 4);
    context.strokeStyle = this.settings.highContrast ? "#fff" : palette.wallEdge;
    context.globalAlpha = this.settings.highContrast ? .72 : .36;
    context.lineWidth = this.settings.highContrast ? 2.5 : 1;
    context.strokeRect(x + 1, y + 1, size - 2, size - 2);
    context.globalAlpha = 1;
    if ((gridX * 5 + gridY * 7 + this.zone.seed) % 19 === 0) {
      context.fillStyle = "rgba(0, 0, 0, .25)";
      context.fillRect(x + size * .7, y + size * .18, 3, size * .46);
    }
  }

  drawLandmark(context, landmark, size, cameraX, cameraY, palette) {
    const x = landmark.x * size - cameraX + size / 2;
    const y = landmark.y * size - cameraY + size / 2;
    context.save();
    context.translate(x, y);
    context.strokeStyle = palette.accent;
    context.fillStyle = "rgba(0, 0, 0, .42)";
    context.lineWidth = 3;
    if (landmark.variant % 2 === 0) {
      context.fillRect(-15, -20, 30, 40);
      context.strokeRect(-15, -20, 30, 40);
      context.beginPath();
      context.moveTo(-8, -10);
      context.lineTo(8, 10);
      context.moveTo(8, -10);
      context.lineTo(-8, 10);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(0, 0, 17, 0, TWO_PI);
      context.fill();
      context.stroke();
      context.fillStyle = palette.accent;
      context.fillRect(-2, -12, 4, 24);
    }
    context.restore();
  }

  drawHidingSpot(context, spot, size, cameraX, cameraY, palette) {
    const x = spot.x * size - cameraX;
    const y = spot.y * size - cameraY;
    context.fillStyle = "rgba(4, 4, 4, .8)";
    context.fillRect(x + size * .18, y + size * .1, size * .64, size * .8);
    context.strokeStyle = palette.wallEdge;
    context.globalAlpha = .48;
    context.strokeRect(x + size * .18, y + size * .1, size * .64, size * .8);
    context.beginPath();
    context.moveTo(x + size * .5, y + size * .12);
    context.lineTo(x + size * .5, y + size * .88);
    context.stroke();
    context.globalAlpha = 1;
  }

  drawItem(context, item, size, cameraX, cameraY, palette) {
    const x = item.x * size - cameraX + size / 2;
    const y = item.y * size - cameraY + size / 2;
    const pulse = this.settings.reducedMotion ? 1 : 1 + Math.sin(this.run.stats.elapsed * 3 + item.x) * .08;
    context.save();
    context.translate(x, y);
    context.scale(pulse, pulse);
    context.shadowBlur = 20;
    context.shadowColor = item.type === "objective" ? palette.accent : "#d9ff9a";
    if (item.type === "objective") {
      context.strokeStyle = palette.accent;
      context.fillStyle = "rgba(4, 5, 3, .76)";
      context.lineWidth = 4;
      context.fillRect(-15, -15, 30, 30);
      context.strokeRect(-15, -15, 30, 30);
      context.beginPath();
      context.moveTo(-9, 0);
      context.lineTo(9, 0);
      context.moveTo(0, -9);
      context.lineTo(0, 9);
      context.stroke();
    } else if (item.type === "note") {
      context.rotate(-.12);
      context.fillStyle = "#eee7d0";
      context.fillRect(-15, -11, 30, 22);
      context.fillStyle = "#6e1d28";
      context.fillRect(-9, -5, 18, 2);
      context.fillRect(-9, 1, 13, 2);
    } else if (item.type === "battery") {
      context.fillStyle = "#d8ff73";
      context.fillRect(-9, -17, 18, 34);
      context.fillStyle = "#27320d";
      context.fillRect(-4, -22, 8, 6);
    } else if (item.type === "medkit") {
      context.fillStyle = "#d9e3dd";
      context.fillRect(-16, -13, 32, 26);
      context.fillStyle = "#b73332";
      context.fillRect(-4, -9, 8, 18);
      context.fillRect(-10, -3, 20, 7);
    } else {
      context.fillStyle = "#bea6ee";
      context.beginPath();
      context.ellipse(0, 0, 15, 9, 0, 0, TWO_PI);
      context.fill();
      context.strokeStyle = "#4a376d";
      context.stroke();
    }
    context.restore();
  }

  drawExit(context, size, cameraX, cameraY, palette) {
    const x = (this.zone.exit.x - .5) * size - cameraX;
    const y = (this.zone.exit.y - .5) * size - cameraY;
    const unlocked = this.zone.objectivesFound >= this.zone.requiredCount;
    context.fillStyle = unlocked ? palette.accent : "#25251f";
    context.fillRect(x + size * .13, y + size * .03, size * .74, size * .94);
    context.fillStyle = "#070804";
    context.fillRect(x + size * .23, y + size * .13, size * .54, size * .81);
    context.fillStyle = unlocked ? palette.accent : "#777466";
    context.beginPath();
    context.arc(x + size * .68, y + size * .52, 3.5, 0, TWO_PI);
    context.fill();
    if (unlocked) {
      context.shadowBlur = 24;
      context.shadowColor = palette.accent;
      context.strokeStyle = palette.accent;
      context.lineWidth = 3;
      context.strokeRect(x + size * .11, y + size * .01, size * .78, size * .98);
      context.shadowBlur = 0;
    }
  }

  drawThreat(context, threat, index, size, cameraX, cameraY, palette) {
    const player = this.run.player;
    const span = distance(player.x, player.y, threat.x, threat.y);
    const visible = span < (player.flashlight ? 7.4 : 2.7) && hasLineOfSight(this.zone.grid, player, threat);
    if (!visible && threat.state !== "chase") return;
    const x = threat.x * size - cameraX;
    const y = threat.y * size - cameraY;
    context.save();
    context.translate(x, y);
    const sway = this.settings.reducedMotion ? 0 : Math.sin(this.run.stats.elapsed * 2.1 + index) * 4;
    context.globalAlpha = threat.stun > 0 ? .45 : clamp(1 - span / 13, .28, .94);
    context.shadowBlur = threat.state === "chase" ? 36 : 18;
    context.shadowColor = palette.danger;
    context.fillStyle = threat.stun > 0 ? "#c7d6d0" : "#030203";
    context.beginPath();
    context.ellipse(0, -size * .2, size * .24, size * .31, 0, 0, TWO_PI);
    context.fill();
    context.beginPath();
    context.moveTo(-size * .21, 0);
    context.lineTo(-size * .29 + sway, size * .72);
    context.lineTo(size * .26 - sway, size * .72);
    context.lineTo(size * .2, 0);
    context.closePath();
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = threat.state === "stunned" ? palette.accent : palette.danger;
    context.fillRect(-size * .13, -size * .24, size * .07, 3);
    context.fillRect(size * .06, -size * .24, size * .07, 3);
    context.restore();
  }

  drawPlayer(context, size, cameraX, cameraY, palette) {
    const player = this.run.player;
    const x = player.x * size - cameraX;
    const y = player.y * size - cameraY;
    context.save();
    context.translate(x, y);
    context.globalAlpha = player.hidden ? .42 : 1;
    context.shadowBlur = player.flashlight ? 18 : 7;
    context.shadowColor = palette.accent;
    context.fillStyle = "#f7f4e6";
    context.beginPath();
    context.arc(0, 0, size * .2, 0, TWO_PI);
    context.fill();
    context.fillStyle = player.crouching ? "#8c897a" : palette.accent;
    context.fillRect(-3, -size * .3, 6, size * .17);
    context.restore();
  }

  drawDarkness(context, size, cameraX, cameraY, palette) {
    const player = this.run.player;
    const x = player.x * size - cameraX;
    const y = player.y * size - cameraY;
    const radius = player.flashlight ? size * (4.2 + player.battery / 31) : size * 2;
    const gradient = context.createRadialGradient(x, y, size * .45, x, y, radius);
    gradient.addColorStop(0, "rgba(0, 0, 0, 0)");
    gradient.addColorStop(.5, "rgba(0, 0, 0, .08)");
    gradient.addColorStop(1, palette.fog);
    context.fillStyle = gradient;
    context.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    if (player.composure < 35) {
      const amount = (35 - player.composure) / 35;
      context.fillStyle = "rgba(65, 0, 20, " + (amount * (this.settings.reducedMotion ? .07 : .12 + Math.sin(this.run.stats.elapsed * 7) * .035)) + ")";
      context.fillRect(0, 0, this.canvasWidth, this.canvasHeight);
    }
  }

  drawNavigation(context, palette) {
    const player = this.run.player;
    const target = this.navigationTarget();
    const angle = Math.atan2(target.y - player.y, target.x - player.x);
    const span = distance(player.x, player.y, target.x, target.y);
    context.save();
    context.translate(this.canvasWidth / 2, 54);
    context.fillStyle = "rgba(2, 3, 2, .78)";
    context.strokeStyle = "rgba(255, 255, 255, .18)";
    context.lineWidth = 1;
    context.fillRect(-150, -27, 300, 54);
    context.strokeRect(-150, -27, 300, 54);
    context.translate(-108, 0);
    context.rotate(angle + Math.PI / 2);
    context.fillStyle = palette.accent;
    context.beginPath();
    context.moveTo(0, -13);
    context.lineTo(9, 9);
    context.lineTo(0, 5);
    context.lineTo(-9, 9);
    context.closePath();
    context.fill();
    context.rotate(-angle - Math.PI / 2);
    context.fillStyle = "#f4f0db";
    context.font = "800 16px ui-monospace, monospace";
    context.textAlign = "left";
    context.fillText((target.type === "exit" ? "SORTIE" : "RELAIS") + " · " + Math.round(span) + " m", 25, 6);
    context.restore();
  }

  drawMinimap(context, palette) {
    const mapWidth = 210;
    const mapHeight = 144;
    const originX = this.canvasWidth - mapWidth - 22;
    const originY = 22;
    const cell = Math.min((mapWidth - 18) / this.zone.grid[0].length, (mapHeight - 18) / this.zone.grid.length);
    context.fillStyle = "rgba(2, 3, 2, .78)";
    context.fillRect(originX, originY, mapWidth, mapHeight);
    context.strokeStyle = "rgba(255, 255, 255, .18)";
    context.strokeRect(originX + .5, originY + .5, mapWidth - 1, mapHeight - 1);
    const offsetX = originX + 9;
    const offsetY = originY + 9;
    this.exploredSet.forEach((key) => {
      const parts = key.split(",");
      const x = Number(parts[0]);
      const y = Number(parts[1]);
      context.fillStyle = this.zone.grid[y]?.[x] === "#" ? palette.wall : "rgba(229, 224, 194, .34)";
      context.fillRect(offsetX + x * cell, offsetY + y * cell, Math.max(1.2, cell), Math.max(1.2, cell));
    });
    context.fillStyle = palette.accent;
    context.beginPath();
    context.arc(offsetX + this.run.player.x * cell, offsetY + this.run.player.y * cell, 3.5, 0, TWO_PI);
    context.fill();
  }

  drawCanvasStatus(context, palette) {
    context.fillStyle = "rgba(2, 3, 2, .78)";
    context.fillRect(18, this.canvasHeight - 58, 390, 40);
    context.strokeStyle = "rgba(255, 255, 255, .14)";
    context.strokeRect(18.5, this.canvasHeight - 57.5, 389, 39);
    context.fillStyle = palette.accent;
    context.font = "900 15px ui-monospace, monospace";
    context.textAlign = "left";
    const light = this.run.player.flashlight ? "LAMPE ON" : "LAMPE OFF";
    const stance = this.run.player.hidden ? "CACHÉ" : this.run.player.crouching ? "ACCROUPI" : "DEBOUT";
    context.fillText(light + " · " + stance + " · NOTE " + this.run.stats.notes + "/3", 34, this.canvasHeight - 32);
  }

  installQaApi() {
    window.__liminalQA = {
      start: (difficulty = "exploration") => this.startNewGame(difficulty),
      state: () => ({
        screen: this.screen,
        modal: this.modalKind,
        zoneIndex: this.run?.zoneIndex ?? null,
        runStatus: this.run?.status ?? null,
        health: this.run?.player.health ?? null,
        saveExists: Boolean(this.store.loadRun()),
        checkpointExists: Boolean(this.store.loadCheckpoint()),
      }),
      closeModal: () => {
        this.manualPaused = false;
        this.closeModal();
      },
      saveAndMenu: () => {
        this.saveGame("QA SAVE");
        this.showMenu();
      },
      collectObjectives: () => {
        if (!this.zone) return;
        this.zone.items.filter((item) => item.type === "objective" && !item.collected).forEach((item) => this.collectItem(item));
        this.updateUi(true);
      },
      collectNotes: () => {
        if (!this.run) return;
        this.run.zones.forEach((zone) => zone.items.filter((item) => item.type === "note").forEach((item) => {
          if (!item.collected) {
            item.collected = true;
            this.run.stats.notes += 1;
          }
        }));
        this.updateUi(true);
      },
      setZone: (index) => {
        this.enterZone(clamp(Number(index) || 0, 0, 2), true);
        this.manualPaused = false;
      },
      goToExit: () => {
        this.run.player.x = this.zone.exit.x;
        this.run.player.y = this.zone.exit.y;
        this.updateInteraction();
        this.renderDirty = true;
      },
      useExit: () => this.useExit(),
      win: (ending = "escape") => this.finishVictory(ending),
      fail: (ending = "consumed") => this.failRun(ending),
      resetStorage: () => {
        this.store.clearActive();
        localStorage.removeItem(PROFILE_KEY);
        location.reload();
      },
    };
  }
}

const app = new LiminalEscapeApp();
if (new URLSearchParams(location.search).get("qa") === "1") app.installQaApi();
