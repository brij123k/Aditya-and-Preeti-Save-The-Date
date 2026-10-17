// Wedding: 8th Feb 2027, Puri (IST)
const WEDDING = new Date("2027-02-08T00:00:00+05:30").getTime();

const intro = document.getElementById("intro");
const card = document.getElementById("card");
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

document.body.classList.add("locked");

// ---------- Music ----------
// Starts playing automatically as soon as the link/page is opened.
// Fallback listeners ensure playback starts on the very first touch/click if the browser blocks initial unmuted autoplay.
const music = document.getElementById("music");
const musicBtn = document.getElementById("musicBtn");

function setMusicUi() {
  const on = !music.paused;
  musicBtn.classList.toggle("playing", on);
  musicBtn.setAttribute("aria-label", on ? "Pause music" : "Play music");
}

function removeAutoplayFallbacks() {
  ["pointerdown", "touchstart", "click", "keydown"].forEach((evt) => {
    window.removeEventListener(evt, handleFirstInteraction, true);
  });
}

function handleFirstInteraction() {
  if (music.paused) {
    startMusic();
  } else {
    removeAutoplayFallbacks();
  }
}

function startMusic() {
  musicBtn.hidden = false;
  if (!music.paused) {
    setMusicUi();
    return;
  }
  const playPromise = music.play();
  if (playPromise !== undefined) {
    playPromise
      .then(() => {
        setMusicUi();
        removeAutoplayFallbacks();
      })
      .catch(() => {
        setMusicUi();
      });
  }
}

// Fallback: if browser autoplay policy blocks unmuted audio on initial load,
// start playback as soon as user touches or clicks anywhere on the screen
["pointerdown", "touchstart", "click", "keydown"].forEach((evt) => {
  window.addEventListener(evt, handleFirstInteraction, true);
});

music.addEventListener("playing", setMusicUi);
music.addEventListener("pause", setMusicUi);

musicBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  if (music.paused) {
    music.play().then(setMusicUi).catch(setMusicUi);
  } else {
    music.pause();
    setMusicUi();
  }
});

// pause when the guest leaves the tab, resume when they come back
let pausedByHide = false;
document.addEventListener("visibilitychange", () => {
  if (document.hidden && !music.paused) { music.pause(); pausedByHide = true; }
  else if (!document.hidden && pausedByHide) { pausedByHide = false; music.play().catch(() => {}); }
});

// Start immediately on opening the link
startMusic();
window.addEventListener("DOMContentLoaded", startMusic);
window.addEventListener("load", startMusic);

// ---------- Screen 1 → Screen 2 ----------
const video = document.getElementById("introVideo");
const PLAY_SECONDS = 1.3; // how much of the intro video plays before the card fades in

let opened = false;
let revealed = false;

async function revealCard() {
  if (revealed) return;
  revealed = true;
  try {
    await scratchSetup;
  } catch (error) {
    revealed = false;
    console.error(error);
    return;
  }
  card.classList.add("show");
  card.setAttribute("aria-hidden", "false");
  intro.classList.add("done");
  document.body.classList.remove("locked");
  window.scrollTo(0, 0);
  startMusic();
  setTimeout(() => intro.remove(), 1100);
}

function openInvite() {
  if (opened) return;
  opened = true;
  intro.classList.add("open");
  startMusic();

  if (reduced) return revealCard();

  video.addEventListener("playing", () => setTimeout(revealCard, PLAY_SECONDS * 1000), { once: true });
  video.addEventListener("ended", revealCard);
  video.play().catch(revealCard);  // if the video can't play, go straight to the card
  setTimeout(revealCard, 9000);    // safety net on very slow connections
}

intro.addEventListener("click", openInvite);
intro.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openInvite(); }
});

// ---------- Scroll reveal ----------
const io = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting || !card.classList.contains("show")) continue;
    const el = entry.target;
    el.classList.add("in");
    if (el.classList.contains("flowers")) {
      setTimeout(() => el.classList.add("scratchable"), 1200);
    }
    io.unobserve(el);
  }
}, { threshold: 0.4 });

// observe only once the card is visible, so reveals play when seen
const startReveal = new MutationObserver(() => {
  if (!card.classList.contains("show")) return;
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
  startReveal.disconnect();
});
startReveal.observe(card, { attributes: true, attributeFilter: ["class"] });

// ---------- Scratch the flowers to reveal the date ----------
// Each flower becomes a canvas painted with its patch of the card background
// plus the flower, so the date underneath stays hidden until it's scratched off.
const flowers = document.getElementById("flowers");
const dateImg = document.getElementById("date");
const scratchHint = document.getElementById("scratchHint");

// flower spans in design pixels (see .flowers in style.css)
const FLOWER_BOX = { x: 285, y: 2128, w: 170, h: 134 };
const CARD_WIDTH = 1080;
const CARD_HEIGHT = 3840;
const SCALE = 2;            // canvas pixels per design pixel
const BRUSH = 34 * SCALE;   // scratch radius
const GRID_X = 8, GRID_Y = 6;
const CLEAR_AT = 0.5;       // share of a flower scratched before it falls away

function loadImage(src) {
  const img = new Image();
  img.src = src;
  return img.decode().then(() => img);
}

function hidePrintedDate(ctx, canvas) {
  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const rowAt = (designY) => Math.round((designY - FLOWER_BOX.y) * canvas.height / FLOWER_BOX.h);
  const cleanTop = rowAt(2150);
  const cleanBottom = canvas.height - 1;

  for (let x = 0; x < canvas.width; x++) {
    const top = (cleanTop * canvas.width + x) * 4;
    const bottom = (cleanBottom * canvas.width + x) * 4;
    for (let y = 0; y < canvas.height; y++) {
      const offset = (y * canvas.width + x) * 4;
      const mix = Math.max(0, (y - cleanTop) / (cleanBottom - cleanTop));
      for (let channel = 0; channel < 3; channel++) {
        pixels.data[offset + channel] = pixels.data[top + channel] * (1 - mix) + pixels.data[bottom + channel] * mix;
      }
    }
  }
  ctx.putImageData(pixels, 0, 0);
}

let scratchReady = false;
const pads = [];

async function setupScratch() {
  if (scratchReady) return;
  scratchReady = true;

  let bg, sprite;
  try {
    [bg, sprite] = await Promise.all([loadImage("assets/main-website-final.webp"), loadImage("assets/flowers.webp")]);
  } catch {
    throw new Error("Unable to load the artwork needed for the scratch-to-reveal date.");
  }
  const sw = sprite.naturalWidth / 3;
  const sourceScaleX = bg.naturalWidth / CARD_WIDTH;
  const sourceScaleY = bg.naturalHeight / CARD_HEIGHT;
  const canvasScaleY = sourceScaleY / sourceScaleX;

  const mask = document.getElementById("dateMask");
  mask.width = FLOWER_BOX.w * 3 * SCALE;
  mask.height = Math.round(FLOWER_BOX.h * canvasScaleY * SCALE);
  const maskCtx = mask.getContext("2d");
  maskCtx.drawImage(bg, FLOWER_BOX.x * sourceScaleX, FLOWER_BOX.y * sourceScaleY, FLOWER_BOX.w * 3 * sourceScaleX, FLOWER_BOX.h * sourceScaleY, 0, 0, mask.width, mask.height);
  hidePrintedDate(maskCtx, mask);

  flowers.querySelectorAll("span").forEach((span, i) => {
    const canvas = document.createElement("canvas");
    canvas.width = FLOWER_BOX.w * SCALE;
    canvas.height = Math.round(FLOWER_BOX.h * canvasScaleY * SCALE);
    const ctx = canvas.getContext("2d");
    const x = FLOWER_BOX.x + i * FLOWER_BOX.w;
    ctx.drawImage(bg, x * sourceScaleX, FLOWER_BOX.y * sourceScaleY, FLOWER_BOX.w * sourceScaleX, FLOWER_BOX.h * sourceScaleY, 0, 0, canvas.width, canvas.height);
    hidePrintedDate(ctx, canvas);
    ctx.drawImage(sprite, i * sw, 0, sw, sprite.naturalHeight, 0, 0, canvas.width, canvas.height);
    ctx.globalCompositeOperation = "destination-out";
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.lineWidth = BRUSH * 2;
    span.appendChild(canvas);
    pads.push({ span, canvas, ctx, cells: new Set(), done: false });
  });

}

const scratchSetup = setupScratch();

function markCells(pad, x, y) {
  const cw = pad.canvas.width / GRID_X, ch = pad.canvas.height / GRID_Y;
  for (let gx = 0; gx < GRID_X; gx++) {
    for (let gy = 0; gy < GRID_Y; gy++) {
      const cx = (gx + 0.5) * cw, cy = (gy + 0.5) * ch;
      if ((cx - x) ** 2 + (cy - y) ** 2 <= BRUSH * BRUSH) pad.cells.add(gx + "," + gy);
    }
  }
}

function scratch(pad, from, to) {
  const r = pad.canvas.getBoundingClientRect();
  const k = pad.canvas.width / r.width;
  const a = { x: (from.x - r.left) * k, y: (from.y - r.top) * k };
  const b = { x: (to.x - r.left) * k, y: (to.y - r.top) * k };
  const outside = (p) => p.x < -BRUSH || p.y < -BRUSH || p.x > pad.canvas.width + BRUSH || p.y > pad.canvas.height + BRUSH;
  if (outside(a) && outside(b)) return;

  pad.ctx.beginPath();
  pad.ctx.moveTo(a.x, a.y);
  pad.ctx.lineTo(b.x + 0.01, b.y);
  pad.ctx.stroke();

  const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / (BRUSH / 2)));
  for (let s = 0; s <= steps; s++) {
    markCells(pad, a.x + (b.x - a.x) * s / steps, a.y + (b.y - a.y) * s / steps);
  }

  if (pad.cells.size / (GRID_X * GRID_Y) >= CLEAR_AT) clearPad(pad);
}

function clearPad(pad) {
  pad.done = true;
  pad.span.classList.add("gone");
  if (pads.every((p) => p.done)) {
    flowers.classList.remove("scratchable");
    scratchHint.classList.add("hidden");
    dateImg.classList.add("revealed");
    petalBurst();
  }
}

let last = null;
flowers.addEventListener("pointerdown", (e) => {
  if (!flowers.classList.contains("scratchable")) return;
  dateImg.classList.add("show");
  last = { x: e.clientX, y: e.clientY };
  flowers.setPointerCapture(e.pointerId);
  pads.forEach((p) => !p.done && scratch(p, last, last));
});
flowers.addEventListener("pointermove", (e) => {
  if (!last) return;
  const now = { x: e.clientX, y: e.clientY };
  pads.forEach((p) => !p.done && scratch(p, last, now));
  last = now;
});
["pointerup", "pointercancel"].forEach((t) => flowers.addEventListener(t, () => (last = null)));

// a little shower of petals once the date is out
function petalBurst() {
  if (reduced) return;
  const u = card.clientWidth / 1080;
  const v = card.clientHeight / CARD_HEIGHT;
  const colors = ["#f07a5a", "#f6a07e", "#ffd2b8", "#f4b942", "#ee8fa6"];
  for (let i = 0; i < 28; i++) {
    const p = document.createElement("i");
    p.className = "petal";
    p.style.left = 540 * u + "px";
    p.style.top = 2237 * v + "px";
    p.style.background = colors[i % colors.length];
    card.appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const dist = (180 + Math.random() * 320) * u;
    const dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist * 0.7 * v / u;
    p.animate([
      { transform: "translate(-50%,-50%) scale(.4) rotate(0deg)", opacity: 1 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 120 * v}px)) scale(1) rotate(${360 + Math.random() * 360}deg)`, opacity: 0 },
    ], { duration: 1300 + Math.random() * 900, easing: "cubic-bezier(.2,.7,.3,1)" }).onfinish = () => p.remove();
  }
}

// ---------- Countdown ----------
const cells = {};
document.querySelectorAll("#countdown [data-unit]").forEach((el) => (cells[el.dataset.unit] = el));

function pad(n) { return String(n).padStart(2, "0"); }

function tick() {
  let diff = Math.max(0, WEDDING - Date.now());
  const s = Math.floor(diff / 1000);
  const values = {
    d: Math.floor(s / 86400),
    h: Math.floor((s % 86400) / 3600),
    m: Math.floor((s % 3600) / 60),
    s: s % 60,
  };
  for (const unit in values) {
    const text = pad(values[unit]);
    const el = cells[unit];
    if (el.textContent !== text) {
      el.textContent = text;
      el.classList.remove("tick");
      void el.offsetWidth; // restart animation
      el.classList.add("tick");
    }
  }
}
tick();
setInterval(tick, 1000);
