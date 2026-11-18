/* Igor Petkov — portfolio interactions */
(() => {
  const $ = (s, r = document) => r.querySelector(s)
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s))
  const html = document.documentElement
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
  const smooth = (t) => t * t * (3 - 2 * t)
  const reduced = false
  const isTouch = matchMedia("(hover: none)").matches

  /* ---------- smooth scroll (desktop wheel only; touch stays native) ---------- */
  /* smooth "buttery" scroll for wheel + trackpad (touch stays native for real momentum) */
  let lenis = null
  if (window.Lenis) {
    lenis = new Lenis({ lerp: 0.085, smoothWheel: true, wheelMultiplier: 0.95, gestureOrientation: "vertical", syncTouch: false, autoRaf: true, respectReducedMotion: false })
    window.__lenis = lenis
  }
  const scrollToEl = (el, instant) => {
    if (!el) return
    if (lenis) lenis.scrollTo(el, { immediate: !!instant, duration: 1.5, easing: (t) => 1 - Math.pow(1 - t, 4) })
    else el.scrollIntoView({ behavior: instant ? "instant" : "smooth" })
  }

  /* ---------- one scroll frame for every effect ----------
     While scrolling nothing reads the layout: every effect works from page positions measured once
     (and again only when the page really changes size), plus the scroll position Lenis already knows. */
  const onFrame = [], remeasure = []
  let vh = innerHeight, vw = innerWidth, lastY = -1
  const scrollPos = () => (lenis ? lenis.animatedScroll : scrollY)
  const runFrame = (force) => { const y = scrollPos(); if (!force && y === lastY) return; lastY = y; for (const f of onFrame) f(y, vh) }
  addEventListener("scroll", () => runFrame(), { passive: true })
  lenis?.on("scroll", () => runFrame())
  // layout position on the page (transforms such as the reveal slide are ignored)
  const pageTop = (el) => { let y = 0; for (let n = el; n; n = n.offsetParent) y += n.offsetTop; return y }
  const pageLeft = (el) => { let x = 0; for (let n = el; n; n = n.offsetParent) x += n.offsetLeft; return x }
  let mfr = 0
  const measureAll = () => { mfr = 0; vh = innerHeight; vw = innerWidth; for (const f of remeasure) f(); runFrame(true) }
  const requestMeasure = () => { if (!mfr) mfr = requestAnimationFrame(measureAll) }
  addEventListener("resize", requestMeasure); addEventListener("load", requestMeasure); document.fonts?.ready.then(requestMeasure)
  if (window.ResizeObserver) new ResizeObserver(requestMeasure).observe(document.body)

  /* ---------- stable keys for language switch ---------- */
  $$("[data-k]").forEach((el, i) => (el.dataset.k = i))

  /* ---------- language switch keeps the exact position ---------- */
  const POS = "ip-pos"
  $$("a[data-lang]").forEach((a) =>
    a.addEventListener("click", () => {
      const y = innerHeight * 0.4
      let el = document.elementFromPoint(innerWidth / 2, y)
      while (el && !el.dataset?.k) el = el.parentElement
      const snap = { t: Date.now(), page: scrollY / Math.max(1, html.scrollHeight - innerHeight) }
      if (el) { const r = el.getBoundingClientRect(); snap.k = el.dataset.k; snap.r = (y - r.top) / Math.max(1, r.height) }
      snap.dark = html.classList.contains("is-dark"); try { sessionStorage.setItem(POS, JSON.stringify(snap)) } catch (e) {}
    })
  )
  const restore = () => {
    let s = null
    try { s = JSON.parse(sessionStorage.getItem(POS) || "null"); sessionStorage.removeItem(POS) } catch (e) {}
    if (!s || Date.now() - s.t > 15000) return false
    if ("scrollRestoration" in history) history.scrollRestoration = "manual"
    const el = s.k != null ? $(`[data-k="${s.k}"]`) : null
    let top
    if (el) { const r = el.getBoundingClientRect(); top = scrollY + r.top + s.r * r.height - innerHeight * 0.4 }
    else top = s.page * (html.scrollHeight - innerHeight)
    window.scrollTo({ top, behavior: "instant" })
    lenis?.scrollTo(top, { immediate: true })
    return true
  }
  const restored = restore()
  // language switch: show the new page only once it sits at the right place, with no colour flash
  if (html.classList.contains("no-tr")) {
    requestAnimationFrame(() => { html.style.visibility = ""; requestAnimationFrame(() => requestAnimationFrame(() => html.classList.remove("no-tr"))) })
  }

  /* ---------- in-page navigation (Work / About / Contact) ---------- */
  $$("[data-go]").forEach((a) =>
    a.addEventListener("click", (e) => {
      const t = document.getElementById(a.dataset.go)
      if (t) { e.preventDefault(); scrollToEl(t); history.replaceState(null, "", "#" + a.dataset.go) }
    })
  )
  if (!restored && location.hash) {
    const t = document.getElementById(location.hash.slice(1))
    if (t) requestAnimationFrame(() => scrollToEl(t, true))
  }

  /* ---------- lazy images fade in after decode ---------- */
  $$('img[loading="lazy"]').forEach((im) => {
    if (im.complete && im.naturalWidth) return
    im.classList.add("lz")
    const ok = () => (im.decode ? im.decode().catch(() => {}) : Promise.resolve()).then(() => im.classList.add("ok"))
    im.addEventListener("load", ok, { once: true }); im.addEventListener("error", () => im.classList.add("ok"), { once: true })
  })

  /* ---------- index cards: zoom follows scroll (JS fallback where CSS scroll timelines are missing) ---------- */
  if (!(window.CSS && CSS.supports("animation-timeline: view()"))) {
    const zs = $$(".item .media .z").map((im) => ({ im, m: im.parentElement, t: 0, h: 1, on: false }))
    remeasure.push(() => zs.forEach((z) => { z.t = pageTop(z.m); z.h = z.m.offsetHeight }))
    const zo = new IntersectionObserver((en) => { en.forEach((x) => { const z = zs.find((q) => q.im === x.target); if (z) z.on = x.isIntersecting }); runFrame(true) }, { rootMargin: "10% 0px" })
    zs.forEach((z) => zo.observe(z.im))
    onFrame.push((y, H) => { for (const z of zs) if (z.on) { const p = clamp((H - (z.t - y)) / (H + z.h), 0, 1); z.im.style.transform = `scale(${(1 + 0.07 * p).toFixed(4)})` } })
  }

  /* ---------- scroll zoom runs only on cards near the screen (the rest stay flat: no GPU layer) ---------- */
  {
    const near = new IntersectionObserver((en) => en.forEach((x) => x.target.classList.toggle("near", x.isIntersecting)), { rootMargin: "60% 0px" })
    $$(".work .item").forEach((it) => near.observe(it))
  }

  /* ---------- card titles: name left, tags right on one line; a card too narrow for both gets a little wider (the picture crops) ---------- */
  const cards = $$(".work .item")
  const fitCards = () => {
    const desk = innerWidth >= 810
    cards.forEach((it) => { it.style.width = ""; $(".media", it).style.aspectRatio = ""; $(".meta", it).classList.remove("stack") })
    if (!desk) return
    const plan = cards.map((it) => {
      const n = $(".meta .n", it).getBoundingClientRect(), t = $(".meta .tag", it).getBoundingClientRect(), m = $(".media", it)
      return { it, m, need: Math.ceil(n.width + t.width + 32), w: it.getBoundingClientRect().width, h: m.getBoundingClientRect().height, ar: +it.style.getPropertyValue("--ar"), col: it.parentElement.clientWidth }
    })
    // one rule for every card: if any title can't share its line with the tags, they all stack
    if (plan.some((p) => p.need > p.col)) { cards.forEach((it) => $(".meta", it).classList.add("stack")); return }
    plan.forEach(({ it, m, need, w, h, ar }) => {
      if (need <= w) return
      // wider, and a little taller where the screen allows, so the picture loses as little as possible
      const nh = Math.max(h, Math.min((need / ar) * 0.84, innerHeight * 0.74))
      it.style.width = need + "px"; m.style.aspectRatio = (need / nh).toFixed(4)
    })
    requestMeasure()
  }
  if (cards.length) {
    fitCards(); document.fonts?.ready.then(fitCards)
    let fr = 0; addEventListener("resize", () => { cancelAnimationFrame(fr); fr = requestAnimationFrame(fitCards) })
  }

  /* ---------- project glow (hover on desktop, centre of screen on phones) ---------- */
  const work = $(".work"), halo = $(".halo")
  if (work && halo) {
    const L = $$("i", halo); let cur = null, flip = 0
    const items = $$(".item[data-glow]")
    // page geometry of every card, measured once: picture box, title box, and the glow placement
    const geo = new Map(); let wTop = 0, wBot = 0
    remeasure.push(() => {
      wTop = pageTop(work); wBot = wTop + work.offsetHeight
      const wl = pageLeft(work)
      items.forEach((it) => {
        const m = it.querySelector(".media"), me = it.querySelector(".meta")
        const mx = pageLeft(m), my = pageTop(m), mw = m.offsetWidth, mh = m.offsetHeight
        const ex = pageLeft(me), ey = pageTop(me)
        // glow centred on the picture, spreading out into the page (a 160px gradient scaled by the GPU)
        const W = Math.max(mw * 2.3, Math.min(vw, 640)), H = Math.max(mh * 2.1, vh * 0.75)
        const x = mx - wl + mw / 2 - W / 2, y = my - wTop + mh / 2 - H / 2
        geo.set(it, { mx, my, mw, mh, ex, ey, ew: me.offsetWidth, eh: me.offsetHeight, cy: my + mh / 2,
          t1: `translate3d(${x.toFixed(0)}px,${y.toFixed(0)}px,0) scale(${(W / 160).toFixed(3)},${(H / 160).toFixed(3)})` })
      })
    })
    // one source of truth: the zoom and the glow switch together, in the same frame
    const show = (it) => {
      if (it === cur) return
      if (cur) cur.classList.remove("on")
      L.forEach((l) => l.classList.remove("on"))
      cur = it
      if (!it) return
      it.classList.add("on")
      if (isTouch) return  // phones: zoom only, no glow
      const l = L[flip ^= 1], g = geo.get(it)
      l.style.transition = "none"; l.style.setProperty("--gc", it.dataset.glow); if (g) l.style.setProperty("--t1", g.t1)
      void l.offsetWidth; l.style.transition = ""
      l.classList.add("on")
    }
    const inWork = (y) => wBot - y > 0 && wTop - y < vh
    if (!isTouch) {
      // desktop: what is under the cursor — checked on mouse move AND on scroll, so it reacts instantly
      let px = -1, py = -1, fr = 0
      const pick = (y) => {
        if (px < 0 || !inWork(y)) return show(null)
        const X = px, Y = py + y
        let hit = null
        for (const it of items) { const g = geo.get(it); if (!g) continue
          if ((X >= g.mx && X <= g.mx + g.mw && Y >= g.my && Y <= g.my + g.mh) || (X >= g.ex && X <= g.ex + g.ew && Y >= g.ey && Y <= g.ey + g.eh)) { hit = it; break } }
        show(hit)
      }
      addEventListener("pointermove", (e) => { if (e.pointerType !== "mouse") return; px = e.clientX; py = e.clientY; if (!fr) fr = requestAnimationFrame(() => { fr = 0; pick(scrollPos()) }) }, { passive: true })
      document.addEventListener("pointerleave", () => { px = -1; show(null) })
      onFrame.push((y) => pick(y))
    } else {
      // phone: the project nearest the middle of the screen is the active one
      onFrame.push((y, H) => {
        if (!inWork(y)) return show(null)
        const mid = y + H / 2; let best = null, bd = 1e9
        for (const it of items) { const g = geo.get(it); if (!g) continue; const d = Math.abs(g.cy - mid); if (d < bd) { bd = d; best = it } }
        show(bd < H * 0.45 ? best : null)
      })
    }
  }

  /* ---------- process rail: runs exactly from the first point to the last ---------- */
  $$(".steps").forEach((box) => {
    const steps = $$(".step", box), rail = $(".rail", box), vert = () => innerWidth < 810
    let p0 = 0, p1 = 1
    const lay = () => {
      // the line spans the whole block; points are measured from where they really are (transforms ignored)
      const a = steps[0], z = steps[steps.length - 1]
      if (vert()) { p0 = a.offsetTop + 8; p1 = z.offsetTop + 8; Object.assign(rail.style, { left: "4px", top: p0 + "px", height: p1 - p0 + "px", width: "1px" }) }
      else { p0 = a.offsetLeft + a.offsetWidth / 2; p1 = z.offsetLeft + z.offsetWidth / 2; Object.assign(rail.style, { left: p0 + "px", top: "0px", width: p1 - p0 + "px", height: "1px" }) }
    }
    // cached: block position on the page and every step's offset inside it
    let bTop = 0, bH = 1, so = []
    const cache = () => { lay(); bTop = pageTop(box); bH = box.offsetHeight; so = steps.map((st) => ({ t: st.offsetTop, c: st.offsetLeft + st.offsetWidth / 2 })) }
    cache(); remeasure.push(cache)
    const go = (k) => {
      box.classList.add("live")
      let f = 1
      if (k != null) { const st = steps[k], cx = st.offsetLeft + (k === 0 ? 4 : k === steps.length - 1 ? st.offsetWidth - 4 : st.offsetWidth / 2); f = (cx - p0) / (p1 - p0) }
      box.style.setProperty("--fill", vert() ? (k == null ? "1" : (k / (steps.length - 1)).toFixed(4)) : clamp(f, 0, 1).toFixed(4))
      steps.forEach((st, i) => st.classList.toggle("dim", k != null && i > k))
    }
    steps.forEach((st, i) => { st.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && go(i)) })
    box.addEventListener("pointerleave", () => go(null))
    if (isTouch) {
      // phone: the line fills with the scroll; every step it reaches lights up, the newest one is "active"
      box.classList.add("scrub")
      let vis = false, lastK = -2, lastF = -1, started = false
      const lit = steps.map(() => null)
      const upd = (y, H) => {
        if (!vis) return
        const top = bTop - y, line = H * 0.6, vt = vert()
        // phone: the line runs down, so it ends exactly at the scroll line; tablet (row): it runs across while the block passes the scroll line
        const f = vt ? clamp((line - top - p0) / (p1 - p0), 0, 1) : clamp((line - top) / Math.max(1, bH * 0.8), 0, 1)
        const fs = f.toFixed(4)
        if (fs !== lastF) { lastF = fs; box.style.setProperty("--fill", fs) }
        if (!started) { started = true; box.classList.add("on", "live") }
        let k = -1
        steps.forEach((st, i) => { const l = vt ? top + so[i].t + 8 <= line : top <= line && f >= (so[i].c - p0) / (p1 - p0) - 0.001; if (l !== lit[i]) { lit[i] = l; st.classList.toggle("dim", !l) } if (l) k = i })
        if (k !== lastK) { lastK = k; steps.forEach((st, i) => st.classList.toggle("on", i === k)) }
      }
      new IntersectionObserver((en) => { vis = en[0].isIntersecting; runFrame(true) }, { rootMargin: "30% 0px" }).observe(box)
      onFrame.push(upd)
    }
  })

  /* ---------- looping animations stop while they are off screen (no work for things nobody sees) ---------- */
  {
    const off = new IntersectionObserver((en) => en.forEach((x) => x.target.classList.toggle("off", !x.isIntersecting)))
    $$(".steps, .dot").forEach((el) => { el.classList.add("off"); off.observe(el) })
  }

  /* ---------- statement text fills with the scroll ---------- */
  const fill = $(".big.fill")
  if (fill) {
    const cs = $$(".c", fill), N = cs.length, last = new Float32Array(N).fill(-1)
    let on = false, fTop = 0
    remeasure.push(() => (fTop = pageTop(fill)))
    const upd = (y, H) => {
      if (!on) return
      const p = clamp((H * 0.88 - (fTop - y)) / (H * 0.88 - H * 0.3), 0, 1)
      const head = p * (N + 8)
      for (let i = 0; i < N; i++) {
        const a = clamp((head - i) / 8, 0, 1), o = Math.round((0.16 + 0.84 * a) * 12) / 12
        if (o !== last[i]) { last[i] = o; cs[i].style.opacity = o }
      }
    }
    new IntersectionObserver((en) => { on = en[0].isIntersecting; runFrame(true) }, { rootMargin: "20% 0px" }).observe(fill)
    onFrame.push(upd)
    fTop = pageTop(fill); on = true; upd(scrollY, vh); on = false
  }

  /* ---------- reveal on scroll ---------- */
  const io = new IntersectionObserver((en) => en.forEach((x) => { if (x.isIntersecting) { x.target.classList.add("in"); io.unobserve(x.target) } }), { threshold: 0.12, rootMargin: "0px 0px -6% 0px" })
  $$(".rv").forEach((el) => {
    const r = el.getBoundingClientRect()
    if (r.top < innerHeight && r.bottom > 0) setTimeout(() => el.classList.add("in"), restored ? 0 : 250 + Math.min(600, r.top * 0.4))
    else io.observe(el)
  })
  requestAnimationFrame(() => html.classList.add("loaded"))
  $$(".wordmark .wm").forEach((w) => w.addEventListener("animationend", () => w.classList.add("done"), { once: true }))

  /* ---------- process rail ---------- */
  $$(".steps").forEach((el) => new IntersectionObserver((en, o) => { if (en[0].isIntersecting) { el.classList.add("on"); o.disconnect() } }, { threshold: 0.35 }).observe(el))

  /* ---------- count up ---------- */
  // like the Framer CountUp: from 0, 1.8 s ease-out, last digit grey
  const paint = (el, n) => { const f = el.dataset.to, t = String(n), cut = t.length < f.length ? t.length : t.length - 1; el.innerHTML = t.slice(0, cut) + "<i>" + t.slice(cut) + "</i>" }
  const cio = new IntersectionObserver((en) => en.forEach((x) => {
    if (!x.isIntersecting) return
    cio.unobserve(x.target)
    const el = x.target, to = +el.dataset.to, t0 = performance.now(), d = 1800
    const step = (t) => { const p = clamp((t - t0) / d, 0, 1); paint(el, Math.round(to * (1 - Math.pow(1 - p, 4)))); if (p < 1) requestAnimationFrame(step) }
    requestAnimationFrame(step)
  }), { threshold: 0.4 })
  $$("[data-to]").forEach((el) => { paint(el, 0); cio.observe(el) })

  /* ---------- accordion ---------- */
  $$(".acc .it").forEach((it) => {
    const h = $(".h", it), b = $(".b", it)
    h.addEventListener("click", () => {
      const open = !it.classList.contains("open")
      it.classList.toggle("open", open)
      h.setAttribute("aria-expanded", open)
      b.style.height = (open ? b.scrollHeight : 0) + "px"
      b.style.opacity = open ? 1 : 0
    })
  })
  addEventListener("resize", () => $$(".acc .it.open .b").forEach((b) => (b.style.height = b.scrollHeight + "px")))

  /* ---------- dark after (home: from the April Uprising project on) ---------- */
  const darkEl = $("[data-dark-after]")
  if (darkEl) {
    // cached position + plain arithmetic on scroll: no layout reads while scrolling
    let darkY = 0, isDark = null
    const measureDark = () => (darkY = pageTop(darkEl) + darkEl.offsetHeight)
    const chk = (y, H) => { const d = y + H * 0.55 > darkY; if (d !== isDark) { isDark = d; html.classList.toggle("is-dark", d) } }
    measureDark(); chk(scrollY, vh)
    remeasure.push(measureDark); onFrame.push(chk)
  }

  /* ---------- edge blur (fades in / out gradually; runs only while something changes) ---------- */
  const edges = $$(".edge").map((e) => ({ e, top: e.classList.contains("top"), l: $("i.l", e), tint: $("i.tint", e), v: 0, q: -1 }))
  const nav = $(".nav"), contactEl = $(".contact")
  let edgeRaf = 0, navInv = false, docH = 0, cTop = 0
  remeasure.push(() => { docH = html.scrollHeight; if (contactEl) cTop = pageTop(contactEl) })
  const edgeTick = () => {
    edgeRaf = 0
    const y = scrollPos(), toEnd = docH - (y + vh)
    let busy = false
    edges.forEach((g) => {
      const target = g.top ? smooth(clamp(y / 220, 0, 1)) : smooth(clamp(toEnd / 320, 0, 1)) * (y > 60 ? 1 : 0)
      g.v += (target - g.v) * 0.18
      if (Math.abs(target - g.v) < 0.01) g.v = target; else busy = true
      const q = Math.round(g.v * 20) / 20
      if (q === g.q) return
      g.q = q
      g.e.style.visibility = q > 0 ? "visible" : "hidden"
      if (q > 0) { const f = `blur(${(5 * q).toFixed(2)}px)`; g.l.style.backdropFilter = f; g.l.style.webkitBackdropFilter = f }
    })
    if (nav && contactEl) {
      const inv = cTop - y < 44
      if (inv !== navInv) { navInv = inv; nav.classList.toggle("inv", inv) }
    }
    if (busy) edgeRaf = requestAnimationFrame(edgeTick)
  }
  const kick = () => { if (!edgeRaf) edgeRaf = requestAnimationFrame(edgeTick) }
  onFrame.push(kick); docH = html.scrollHeight; if (contactEl) cTop = pageTop(contactEl); kick()

  /* ---------- ticker (compositor animation, no main-thread work) ---------- */
  $$(".ticker .track").forEach((tr) => {
    let anim = null, rate = 1, target = 1, raf = 0
    const build = () => {
      const half = tr.scrollWidth / 2
      if (!half) return
      const t = anim ? anim.currentTime : 0
      anim?.cancel()
      anim = tr.animate([{ transform: "translate3d(0,0,0)" }, { transform: `translate3d(${-half}px,0,0)` }], { duration: (half / 60) * 1000, iterations: Infinity })
      anim.currentTime = t || 0; anim.playbackRate = rate
    }
    build(); document.fonts?.ready.then(build); addEventListener("resize", build)
    const ease = () => { rate += (target - rate) * 0.08; if (Math.abs(target - rate) < 0.01) rate = target; if (anim) anim.playbackRate = rate; raf = rate !== target ? requestAnimationFrame(ease) : 0 }
    const set = (r) => { target = r; if (!raf) raf = requestAnimationFrame(ease) }
    tr.addEventListener("pointerenter", (e) => e.pointerType === "mouse" && set(0.4))
    tr.addEventListener("pointerleave", () => set(1))
    new IntersectionObserver((en) => { if (!anim) return; en[0].isIntersecting ? anim.play() : anim.pause() }).observe(tr.parentElement)
  })

  /* ---------- infinite project reel ----------
     Idle drift runs as a compositor animation (zero main-thread work).
     The moment you touch / drag / swipe it, JS physics takes over (inertia),
     and when it has settled back to its own pace it hands back to the compositor. */
  $$(".reel .track").forEach((n) => {
    const kids = Array.from(n.children), half = kids.length / 2
    let period = 0
    const measure = () => (period = kids[half].offsetLeft - kids[0].offsetLeft)
    measure()
    const base = () => (innerWidth < 810 ? 22 : 30)
    let speed = base(), x = 0, v = -speed, hover = false, visible = true
    let anim = null, rate = 1, rateRaf = 0, raf = 0, calm = 0
    let down = false, drag = false, sx = 0, sy = 0, lx = 0, lt = 0, vel = 0, moved = 0, pid = -1, wheelT = 0, wv = 0, prev = 0
    const wrap = () => { if (period > 0) { while (x <= -period) x += period; while (x > 0) x -= period } }
    const put = () => (n.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`)
    const readX = () => { try { return new DOMMatrixReadOnly(getComputedStyle(n).transform).m41 } catch (e) { return x } }
    const toAuto = () => {
      if (raf) { cancelAnimationFrame(raf); raf = 0 }
      if (!period) measure()
      if (!period) return
      wrap(); put()
      rate = hover ? 0.5 : 1
      anim = n.animate([{ transform: `translate3d(${x}px,0,0)` }, { transform: `translate3d(${x - period}px,0,0)` }], { duration: (period / speed) * 1000, iterations: Infinity })
      anim.playbackRate = rate
      if (!visible) anim.pause()
    }
    const toJS = () => {
      if (anim) { x = readX(); wrap(); put(); v = -speed * anim.playbackRate; anim.cancel(); anim = null }
      calm = 0
      if (!raf) { prev = performance.now(); raf = requestAnimationFrame(frame) }
    }
    const frame = (t) => {
      raf = 0
      const dt = Math.min(0.05, (t - prev) / 1000); prev = t
      const target = -(hover ? speed * 0.5 : speed)
      if (!drag && t - wheelT > 80) {
        v += (target - v) * (1 - Math.exp(-dt * 1.6))
        x += v * dt
        calm = Math.abs(v - target) < 0.6 ? calm + dt : 0
      } else calm = 0
      wrap(); put()
      if (calm > 0.25 || !visible) { v = target; toAuto(); return }
      raf = requestAnimationFrame(frame)
    }
    const setRate = (r) => {
      if (!anim) return
      const step = () => { rate += (r - rate) * 0.1; if (Math.abs(r - rate) < 0.01) rate = r; anim && (anim.playbackRate = rate); rateRaf = rate !== r && anim ? requestAnimationFrame(step) : 0 }
      cancelAnimationFrame(rateRaf); rateRaf = requestAnimationFrame(step)
    }
    const start = () => { measure(); if (period) toAuto(); else setTimeout(start, 200) }
    document.fonts?.ready.then(start); if (!document.fonts) start()
    addEventListener("load", () => { const o = period; measure(); if (anim && o !== period) { x = readX(); anim.cancel(); anim = null; toAuto() } })
    new IntersectionObserver((en) => {
      visible = en[0].isIntersecting
      if (anim) visible ? anim.play() : anim.pause()
    }).observe(n.parentElement)
    n.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "mouse" && e.button !== 0) return
      down = true; drag = false; moved = 0; vel = 0; sx = lx = e.clientX; sy = e.clientY; lt = performance.now(); pid = e.pointerId
    })
    addEventListener("pointermove", (e) => {
      if (!down || e.pointerId !== pid) return
      if (!drag) {
        const ax = Math.abs(e.clientX - sx), ay = Math.abs(e.clientY - sy)
        if (e.pointerType !== "mouse" && ay > ax && ay > 8) { down = false; return }
        if (ax < 6) return
        drag = true; toJS(); n.classList.add("grab"); try { n.setPointerCapture(pid) } catch (err) {}
      }
      const now = performance.now(), dx = e.clientX - lx, dtm = Math.max(1, now - lt)
      x += dx; moved += Math.abs(dx)
      vel = vel * 0.6 + (dx / dtm) * 1000 * 0.4
      lx = e.clientX; lt = now; wrap(); put()
    }, { passive: true })
    const up = (e) => {
      if (!down || (e && e.pointerId !== pid)) return
      down = false
      if (!drag) return
      drag = false; n.classList.remove("grab")
      if (performance.now() - lt > 90) vel *= 0.15
      v = clamp(vel, -5000, 5000); prev = performance.now(); toJS()
    }
    addEventListener("pointerup", up); addEventListener("pointercancel", up); addEventListener("blur", () => up())
    n.addEventListener("click", (e) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); moved = 0 } }, true)
    n.addEventListener("dragstart", (e) => e.preventDefault())
    n.addEventListener("wheel", (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return
      e.preventDefault()
      toJS()
      const now = performance.now(), gap = now - wheelT
      const d = -(e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX)
      x += d
      const inst = (d / clamp(gap, 8, 40)) * 1000
      wv = gap > 150 ? d * 6 : wv * 0.75 + inst * 0.25
      v = clamp(wv, -3500, 3500); wheelT = now; wrap(); put()
    }, { passive: false })
    n.addEventListener("pointerenter", (e) => { if (e.pointerType === "mouse") { hover = true; setRate(0.5) } })
    n.addEventListener("pointerleave", () => { hover = false; setRate(1) })
    addEventListener("resize", () => { const s0 = speed; speed = base(); const o = period; measure(); if (anim && (o !== period || s0 !== speed)) { x = readX(); anim.cancel(); anim = null; toAuto() } })
  })

  /* ---------- lightbox ---------- */
  const lb = $(".lb")
  if (lb) {
    const img = $("img", lb), cnt = $(".cnt", lb)
    let group = [], idx = 0, logo = false, open = false
    const items = $$("[data-lb]")
    const show = (i, dir = 0) => {
      idx = (i + group.length) % group.length
      const el = group[idx]
      img.classList.remove("ready")
      const src = innerWidth * devicePixelRatio <= 1700 && el.dataset.lbm ? el.dataset.lbm : el.dataset.lb
      const go = () => { img.src = src; img.alt = el.dataset.alt || ""; img.style.width = logo ? el.dataset.lw : ""; (img.decode ? img.decode() : Promise.resolve()).catch(() => {}).then(() => requestAnimationFrame(() => img.classList.add("ready"))) }
      dir ? setTimeout(go, 160) : go()
      cnt.textContent = `${String(idx + 1).padStart(2, "0")} / ${String(group.length).padStart(2, "0")}`
    }
    const openAt = (el) => {
      logo = el.dataset.lbg === "logo"
      group = items.filter((x) => (x.dataset.lbg === "logo") === logo)
      lb.classList.toggle("logo", logo); lb.classList.toggle("single", group.length < 2)
      show(group.indexOf(el)); lb.classList.add("on"); open = true; html.classList.add("lb-open"); lenis?.stop()
    }
    const close = () => { lb.classList.remove("on"); open = false; html.classList.remove("lb-open"); lenis?.start(); setTimeout(() => { if (!open) img.removeAttribute("src") }, 450) }
    items.forEach((el) => el.addEventListener("click", (e) => { e.preventDefault(); openAt(el) }))
    $(".x", lb).addEventListener("click", (e) => { e.stopPropagation(); close() })
    $(".pv", lb).addEventListener("click", (e) => { e.stopPropagation(); show(idx - 1, -1) })
    $(".nx", lb).addEventListener("click", (e) => { e.stopPropagation(); show(idx + 1, 1) })
    lb.addEventListener("click", () => close())
    addEventListener("keydown", (e) => {
      if (!open) return
      if (e.key === "Escape") close()
      if (e.key === "ArrowRight" && group.length > 1) show(idx + 1, 1)
      if (e.key === "ArrowLeft" && group.length > 1) show(idx - 1, -1)
    })
    let tx = 0, ty = 0
    lb.addEventListener("touchstart", (e) => { tx = e.touches[0].clientX; ty = e.touches[0].clientY }, { passive: true })
    lb.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) && group.length > 1) { e.preventDefault(); show(idx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1) }
      else if (dy > 80 && Math.abs(dy) > Math.abs(dx)) { e.preventDefault(); close() }
    })
  }

  /* ---------- local time (contact) ---------- */
  const clock = $("[data-clock]")
  if (clock) {
    const fmt = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Sofia" })
    const tick = () => (clock.textContent = fmt.format(new Date()))
    tick(); setInterval(tick, 15000)
  }
})()
