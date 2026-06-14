/* ============================================================
   Samuel Ezra Remeeus · Portfolio interactions (cover + viewer)
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => Array.from(c.querySelectorAll(s));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // keep keyboard focus inside an open overlay
  function trapFocus(container, e) {
    if (e.key !== "Tab") return;
    const list = $$('button,a[href],input,[tabindex]:not([tabindex="-1"])', container)
      .filter(el => el.offsetParent !== null);
    if (!list.length) return;
    const first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  const PROJECTS = window.PROJECTS || [];
  const HERO = window.HERO || [];
  const REELS = [
    { file: "degym-kuta", title: "Degym, Kuta", sub: "Fitness" },
    { file: "cuprum-1", title: "Cuprum I", sub: "Brand" },
    { file: "degym-kerobokan", title: "Degym, Kerobokan", sub: "Fitness" },
    { file: "cuprum-2", title: "Cuprum II", sub: "Brand" },
    { file: "mahajati", title: "Mahajati", sub: "Craft" },
  ];
  const CLIENTS = PROJECTS.map(p => p.name);
  const GROUPS = [
    { key: "all", label: "All" },
    { key: "beauty", label: "Beauty" },
    { key: "fashion", label: "Fashion" },
    { key: "wedding", label: "Wedding" },
    { key: "product", label: "Product" },
    { key: "fnb", label: "Food & Beverage" },
    { key: "commercial", label: "Commercial" },
    { key: "personal", label: "Personal" },
  ];

  const yr = $("#yr"); if (yr) yr.textContent = new Date().getFullYear();

  /* ---------- hero crossfade ---------- */
  (function hero() {
    const bg = $("#heroBg");
    if (!bg || !HERO.length) return;
    HERO.forEach((h, i) => {
      const s = document.createElement("div");
      s.className = "slide" + (i === 0 ? " active" : "");
      s.style.backgroundImage = `url(assets/img/hero/${h}.jpg)`;
      bg.appendChild(s);
    });
    if (reduce || HERO.length < 2) return;
    const slides = $$(".slide", bg);
    let i = 0;
    setInterval(() => {
      slides[i].classList.remove("active");
      i = (i + 1) % slides.length;
      slides[i].classList.add("active");
    }, 5200);
  })();

  /* ---------- marquee ---------- */
  (function marquee() {
    const t = $("#marquee");
    if (!t) return;
    const make = () => CLIENTS.map(c => `<span>${c}</span>`).join("");
    t.innerHTML = make() + make();
  })();

  /* ---------- project index list + hover preview ---------- */
  const plist = $("#plist"), pfilters = $("#pfilters"), plv = $("#plv"), plvImg = $("#plvImg");
  let curGroup = "all";

  function buildList() {
    if (!plist) return;
    PROJECTS.forEach((p, idx) => {
      const cover = p.photos[0];
      if (!cover) return;
      const li = document.createElement("li");
      const row = document.createElement("button");
      row.type = "button"; row.className = "prow"; row.dataset.proj = p.id; row.dataset.group = p.group;
      row.setAttribute("aria-label", `${p.name}, ${p.cat}. Open project, ${p.photos.length} photos`);
      row.innerHTML =
        `<span class="num">${String(idx + 1).padStart(2, "0")}</span>` +
        `<span class="pname">${p.name}</span>` +
        `<span class="pmeta"><span class="pcat">${p.cat}</span></span>` +
        `<span class="parrow" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17L17 7M9 7h8v8"/></svg></span>` +
        `<span class="thumb" aria-hidden="true"><img src="assets/img/grid/${cover.id}.jpg" alt="" loading="lazy" decoding="async" style="transform:scale(${p.zoom||1})"></span>`;
      const openFrom = () => {
        const src = plv.classList.contains("on") ? plvImg : row.querySelector(".thumb img");
        openViewer(p.id, src && src.offsetParent !== null ? src : null);
        hidePreview();
      };
      row.addEventListener("click", openFrom);
      row.addEventListener("mouseenter", () => showPreview(p, row));
      row.addEventListener("focus", () => showPreview(p, row));
      li.appendChild(row);
      plist.appendChild(li);
    });
    plist.addEventListener("mouseleave", hidePreview);
  }

  /* floating preview follows the cursor (desktop only) */
  let plvRaf = null, plvX = 0, plvY = 0, plvTX = 0, plvTY = 0;
  const canHover = window.matchMedia("(hover:hover)").matches;
  function showPreview(p, row) {
    if (!canHover || reduce || window.innerWidth <= 860) return;
    plvImg.src = `assets/img/grid/${p.photos[0].id}.jpg`;
    plvImg.style.transform = `scale(${p.zoom || 1})`;
    if (row && (plvTX === 0 && plvTY === 0)) {     // keyboard focus before any mouse move
      const r = row.getBoundingClientRect();
      plvTX = plvX = Math.round(r.left + r.width * 0.55);
      plvTY = plvY = Math.round(r.top + r.height / 2);
    }
    plv.classList.add("on");
    if (!plvRaf) plvRaf = requestAnimationFrame(plvTick);
  }
  function hidePreview() { plv.classList.remove("on"); }
  if (plv) {
    document.addEventListener("mousemove", e => {
      const row = e.target.closest ? e.target.closest(".prow") : null;
      if (!plv.classList.contains("on")) {
        plvX = plvTX = e.clientX; plvY = plvTY = e.clientY;
        // re-show after a scroll hid it while the pointer is still over a row
        if (row) { const pr = PROJECTS.find(x => x.id === row.dataset.proj); if (pr) showPreview(pr, row); }
        return;
      }
      // self-heal: if the pointer is no longer over a project row, drop the preview
      if (!row) { hidePreview(); return; }
      plvTX = e.clientX; plvTY = e.clientY;
      if (!plvRaf) plvRaf = requestAnimationFrame(plvTick);
    }, { passive: true });
    // the page can move under a stationary pointer; never leave the preview stranded
    window.addEventListener("scroll", hidePreview, { passive: true });
    // leaving the tab/window mid-hover never fires mouseleave -> clear it on return
    document.addEventListener("visibilitychange", () => { if (document.hidden) hidePreview(); });
    window.addEventListener("blur", hidePreview);
  }
  function plvTick() {
    plvX += (plvTX - plvX) * 0.16;
    plvY += (plvTY - plvY) * 0.16;
    const w = plv.offsetWidth, h = plv.offsetHeight;
    let x = plvX + 36, y = plvY - h / 2;
    if (x + w > window.innerWidth - 16) x = plvX - w - 36;   // flip to the left near the right edge
    y = Math.max(12, Math.min(window.innerHeight - h - 12, y));
    plv.style.left = x + "px"; plv.style.top = y + "px";
    if (Math.abs(plvTX - plvX) > 0.3 || Math.abs(plvTY - plvY) > 0.3) plvRaf = requestAnimationFrame(plvTick);
    else plvRaf = null;
  }

  /* filter chips */
  function buildFilters() {
    if (!pfilters) return;
    GROUPS.forEach(g => {
      const n = g.key === "all" ? PROJECTS.length : PROJECTS.filter(p => p.group === g.key).length;
      if (!n) return;
      const b = document.createElement("button");
      b.type = "button"; b.dataset.key = g.key;
      b.className = g.key === "all" ? "active" : "";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", g.key === "all" ? "true" : "false");
      b.innerHTML = `${g.label} <span class="n">${n}</span>`;
      b.addEventListener("click", () => {
        if (curGroup === g.key) return;
        curGroup = g.key;
        $$("button", pfilters).forEach(x => {
          const on = x === b;
          x.classList.toggle("active", on);
          x.setAttribute("aria-selected", on ? "true" : "false");
        });
        hidePreview();
        $$(".prow", plist).forEach(r => r.classList.toggle("hidden", g.key !== "all" && r.dataset.group !== g.key));
      });
      pfilters.appendChild(b);
    });
  }

  buildList();
  buildFilters();

  /* ---------- reels ---------- */
  (function reels() {
    const r = $("#reels");
    if (!r) return;
    REELS.forEach(x => {
      const el = document.createElement("div");
      el.className = "reel";
      el.innerHTML =
        `<img class="poster" src="assets/video/poster/${x.file}.jpg" alt="${x.title}, ${x.sub} video still" loading="lazy" decoding="async">` +
        `<div class="veil"></div>` +
        `<button type="button" class="play" aria-label="Play ${x.title}"><svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>` +
        `<div class="cap"><div class="t">${x.title}</div><div class="s">${x.sub}</div></div>`;
      let pv = null;
      if (window.matchMedia("(hover:hover)").matches && !reduce) {
        el.addEventListener("mouseenter", () => {
          if (el.classList.contains("playing")) return;
          if (!pv) {
            pv = document.createElement("video");
            pv.src = `assets/video/${x.file}.mp4`;
            pv.muted = true; pv.loop = true; pv.playsInline = true;
            pv.className = "preview";
            el.insertBefore(pv, $(".veil", el));
          }
          pv.play().catch(() => {});
          el.classList.add("previewing");
        });
        const stopPreview = () => { if (pv) pv.pause(); el.classList.remove("previewing"); };
        el.addEventListener("mouseleave", stopPreview);
        // leaving the tab mid-hover skips mouseleave; reset so it isn't stuck on return
        document.addEventListener("visibilitychange", () => { if (document.hidden) stopPreview(); });
        window.addEventListener("blur", stopPreview);
      }
      $(".play", el).addEventListener("click", () => {
        if ($("video.full", el)) return;
        if (pv) { pv.pause(); pv.remove(); pv = null; }
        el.classList.remove("previewing");
        const v = document.createElement("video");
        v.className = "full";
        v.src = `assets/video/${x.file}.mp4`;
        v.controls = true; v.playsInline = true; v.preload = "auto";
        v.setAttribute("poster", `assets/video/poster/${x.file}.jpg`);
        el.appendChild(v); el.classList.add("playing");
        v.addEventListener("ended", () => { el.classList.remove("playing"); v.remove(); });
        $$("video", r).forEach(o => { if (o !== v) o.pause(); });
        v.play().catch(() => {});
      });
      r.appendChild(el);
    });
  })();

  /* ---------- project viewer ---------- */
  const vw = $("#viewer"), vwTitle = $("#vwTitle"), vwCat = $("#vwCat"),
        vwCount = $("#vwCount"), vwThumbs = $("#vwThumbs"),
        vwStage = $("#vwStage"), vwMain = $(".vw-main", vw);
  const EASE_CB = "cubic-bezier(.22,.61,.36,1)";
  let curProj = null, vIdx = 0, vwOpener = null, cur = null;

  const fullSrc = ph => `assets/img/full/${ph.id}.jpg`;
  const altText = () => `${curProj.name} ${curProj.cat} photography by Samuel Remeeus`;
  function makeFrame(src) { const im = document.createElement("img"); im.className = "vw-frame"; im.alt = altText(); im.src = src; return im; }
  function syncMeta() {
    vwCount.textContent = `${vIdx + 1} / ${curProj.photos.length}`;
    $$("img", vwThumbs).forEach((t, k) => {
      const on = k === vIdx; t.classList.toggle("active", on);
      if (on) t.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  function openViewer(id, srcImg) {
    curProj = PROJECTS.find(p => p.id === id);
    if (!curProj) return;
    vwOpener = document.activeElement; vIdx = 0;
    vwTitle.textContent = curProj.name; vwCat.textContent = curProj.cat;
    vwThumbs.innerHTML = curProj.photos.map((ph, i) =>
      `<img src="assets/img/grid/${ph.id}.jpg" data-i="${i}" alt="${curProj.name} photo ${i + 1}" loading="lazy">`).join("");
    $$("img", vwThumbs).forEach(t => t.addEventListener("click", () => goTo(+t.dataset.i)));
    vwStage.innerHTML = "";
    cur = makeFrame(fullSrc(curProj.photos[0]));
    vwStage.appendChild(cur);
    syncMeta();
    vw.classList.add("open");
    document.body.style.overflow = "hidden";
    setTimeout(() => { const c = $("#vwClose"); if (c) c.focus(); }, 60);
    if (srcImg && !reduce) expandFrom(srcImg);
    else cur.classList.add("loaded");
  }

  // iOS-style expand: clone the clicked cover and grow it to fill the stage
  function expandFrom(srcImg) {
    const from = srcImg.getBoundingClientRect();
    const to = vwStage.getBoundingClientRect();
    const clone = document.createElement("img");
    clone.className = "vw-clone"; clone.src = srcImg.currentSrc || srcImg.src;
    clone.style.cssText = `left:${from.left}px;top:${from.top}px;width:${from.width}px;height:${from.height}px;border-radius:5px`;
    document.body.appendChild(clone);
    clone.getBoundingClientRect();                       // reflow
    clone.style.transition = `left .55s ${EASE_CB},top .55s ${EASE_CB},width .55s ${EASE_CB},height .55s ${EASE_CB},border-radius .55s ${EASE_CB}`;
    clone.style.left = to.left + "px"; clone.style.top = to.top + "px";
    clone.style.width = to.width + "px"; clone.style.height = to.height + "px"; clone.style.borderRadius = "0px";
    let done = false;
    const finish = () => {
      if (done) return; done = true;
      cur.classList.add("loaded");
      clone.style.transition = "opacity .2s"; clone.style.opacity = "0";
      setTimeout(() => clone.remove(), 240);
    };
    clone.addEventListener("transitionend", finish, { once: true });
    setTimeout(finish, 640);                             // fallback
  }

  // switch photo with a vertical slide (below -> slide down, above -> slide up)
  function goTo(i) {
    if (!curProj) return;
    const n = curProj.photos.length, target = ((i % n) + n) % n;
    if (target === vIdx) return;
    vIdx = target; syncMeta();
    const ph = curProj.photos[vIdx];
    if (reduce) { vwStage.innerHTML = ""; cur = makeFrame(fullSrc(ph)); cur.classList.add("loaded"); vwStage.appendChild(cur); return; }
    $$(".vw-frame", vwStage).forEach(f => { if (f !== cur) f.remove(); });
    const out = cur;
    // cinematic dissolve: new photo fades in with a gentle settle over the old one
    const incoming = makeFrame(fullSrc(ph));
    incoming.style.zIndex = "2";
    incoming.style.opacity = "0";
    incoming.style.transform = "scale(1.045)";
    incoming.style.transition = "none";
    vwStage.appendChild(incoming);
    incoming.getBoundingClientRect();                                               // reflow
    incoming.style.transition = "opacity .55s cubic-bezier(.33,.62,.4,1), transform .95s cubic-bezier(.22,.61,.36,1)";
    const reveal = () => { incoming.style.opacity = "1"; incoming.style.transform = "scale(1)"; };
    if (incoming.complete && incoming.naturalWidth) reveal();
    else { incoming.addEventListener("load", reveal, { once: true }); setTimeout(reveal, 900); }
    if (out) {
      out.style.zIndex = "1";
      out.style.transition = "opacity .6s cubic-bezier(.33,.62,.4,1)";
      out.style.opacity = "0";
      const rm = () => { if (out.parentNode && out !== cur) out.remove(); };
      out.addEventListener("transitionend", rm, { once: true });
      setTimeout(rm, 800);
    }
    cur = incoming;
  }

  function closeViewer() {
    vw.classList.remove("open");
    document.body.style.overflow = "";
    if (vwOpener && vwOpener.focus) vwOpener.focus();
  }

  $("#vwClose").addEventListener("click", closeViewer);
  $("#vwBackdrop").addEventListener("click", closeViewer);
  vwMain.addEventListener("click", e => { if (e.target === vwMain || e.target === vwStage) closeViewer(); });
  document.addEventListener("keydown", e => {
    if (!vw.classList.contains("open")) return;
    if (e.key === "Escape") closeViewer();
    else if (e.key === "ArrowDown" || e.key === "ArrowRight") { e.preventDefault(); goTo(vIdx + 1); }
    else if (e.key === "ArrowUp" || e.key === "ArrowLeft") { e.preventDefault(); goTo(vIdx - 1); }
    else if (e.key === "Tab") trapFocus(vw, e);
  });
  let wheelLock = 0;
  vw.addEventListener("wheel", e => {
    if (!vw.classList.contains("open")) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelLock < 450 || Math.abs(e.deltaY) < 16) return;
    wheelLock = now;
    goTo(vIdx + (e.deltaY > 0 ? 1 : -1));
  }, { passive: false });
  let ty = 0;
  vw.addEventListener("touchstart", e => ty = e.changedTouches[0].clientY, { passive: true });
  vw.addEventListener("touchend", e => {
    const dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dy) > 50) goTo(vIdx + (dy < 0 ? 1 : -1));   // swipe up -> next photo (below)
  }, { passive: true });

  /* ---------- load intro (once per visit) ---------- */
  (function intro() {
    if (reduce) return;
    try {
      if (sessionStorage.getItem("introShown")) return;
      sessionStorage.setItem("introShown", "1");
    } catch (e) { return; }
    document.documentElement.classList.add("intro-hold");
    const el = document.createElement("div");
    el.className = "intro";
    el.innerHTML =
      '<div class="iphoto" aria-hidden="true"></div>' +
      '<div class="iquote"><span class="iq-wrap"><p class="iq-line">Vision, <em>framed</em><br>with purpose.</p></span></div>' +
      '<div class="iname"><span><i>Samuel</i></span><span><i>Remeeus</i></span></div>' +
      '<span class="isub">Photographer &amp; Videographer · Bali</span>' +
      '<span class="iline" aria-hidden="true"><i></i></span>';
    document.body.appendChild(el);
    document.body.style.overflow = "hidden";
    setTimeout(() => {
      el.classList.add("out");
      setTimeout(() => { el.remove(); document.body.style.overflow = ""; }, 880);
    }, 5300);
  })();

  /* ---------- custom cursor badge (View / Play) ---------- */
  (function cursorBadge() {
    if (!window.matchMedia("(hover:hover)").matches || reduce) return;
    const c = document.createElement("div");
    c.className = "cursor";
    const label = document.createElement("span");
    c.appendChild(label);
    document.body.appendChild(c);
    let cx = 0, cy = 0, tx = 0, ty = 0, raf = null, on = false;
    function tick() {
      cx += (tx - cx) * 0.3; cy += (ty - cy) * 0.3;
      c.style.left = cx + "px"; c.style.top = cy + "px";
      if (Math.abs(tx - cx) > 0.4 || Math.abs(ty - cy) > 0.4) raf = requestAnimationFrame(tick);
      else raf = null;
    }
    document.addEventListener("mousemove", e => {
      tx = e.clientX; ty = e.clientY;
      if (on && !raf) raf = requestAnimationFrame(tick);
    }, { passive: true });
    function setOn(text) {
      label.textContent = text;
      if (!on) {
        on = true;
        cx = tx; cy = ty;                       // appear at the pointer, no fly-in
        c.style.left = cx + "px"; c.style.top = cy + "px";
        c.classList.add("on");
        document.documentElement.classList.add("cursor-active");
      }
    }
    function setOff() {
      if (!on) return;
      on = false;
      c.classList.remove("on");
      document.documentElement.classList.remove("cursor-active");
    }
    document.addEventListener("mouseover", e => {
      if (e.target.closest(".prow")) setOn("View");
      else {
        const reel = e.target.closest(".reel");
        if (reel && !reel.classList.contains("playing")) setOn("Play");
        else setOff();
      }
    });
    document.addEventListener("mousedown", setOff);
    window.addEventListener("scroll", setOff, { passive: true });
    document.addEventListener("mouseleave", setOff);
    document.addEventListener("visibilitychange", () => { if (document.hidden) setOff(); });
    window.addEventListener("blur", setOff);
  })();

  /* ---------- nav scroll state + mobile menu ---------- */
  const navBar = $("#nav");
  const onScroll = () => navBar.classList.toggle("scrolled", window.scrollY > 40);
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  const menu = $("#menu"), toggle = $("#navToggle"), mClose = $("#menuClose");
  const openMenu = () => { menu.classList.add("open"); toggle.setAttribute("aria-expanded", "true"); document.body.style.overflow = "hidden"; mClose.focus(); };
  const closeMenu = () => { menu.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); document.body.style.overflow = ""; toggle.focus(); };
  toggle.addEventListener("click", openMenu);
  mClose.addEventListener("click", closeMenu);
  $$("[data-mlink]").forEach(a => a.addEventListener("click", closeMenu));
  document.addEventListener("keydown", e => {
    if (!menu.classList.contains("open")) return;
    if (e.key === "Escape") closeMenu();
    else if (e.key === "Tab") trapFocus(menu, e);
  });

  /* ---------- active nav link ---------- */
  (function activeNav() {
    const links = $$(".nav-links a");
    const map = {};
    links.forEach(l => { map[l.getAttribute("href").slice(1)] = l; });
    const io = new IntersectionObserver(es => {
      es.forEach(e => {
        if (e.isIntersecting) {
          links.forEach(l => l.classList.remove("active"));
          if (map[e.target.id]) map[e.target.id].classList.add("active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    ["work", "motion", "about", "experience"].forEach(id => { const s = document.getElementById(id); if (s) io.observe(s); });
  })();

  /* ---------- generic reveal ---------- */
  (function reveal() {
    const els = $$(".reveal");
    if (reduce) { els.forEach(e => e.classList.add("in")); return; }
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    els.forEach(e => io.observe(e));
  })();

  /* ---------- stat count-up ---------- */
  (function counters() {
    const stats = $$("[data-count]");
    if (!stats.length) return;
    const run = (el) => {
      const target = +el.dataset.count, suffix = el.dataset.suffix || "";
      if (reduce) { el.textContent = target + suffix; return; }
      let n = 0; const step = Math.max(1, Math.round(target / 28));
      const t = setInterval(() => {
        n += step; if (n >= target) { n = target; clearInterval(t); }
        el.textContent = n + suffix;
      }, 36);
    };
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.isIntersecting) { run(e.target); io.unobserve(e.target); } });
    }, { threshold: 0.6 });
    stats.forEach(s => io.observe(s));
  })();

})();
