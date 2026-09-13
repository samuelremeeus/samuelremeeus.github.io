/* One place to switch portfolio media between an R2 release or local assets. */
(function () {
  "use strict";

  const mediaBase =
    "https://portfolio-media.samuelremeeus.workers.dev/media/v1"
      .replace(/\/+$/, "");
  window.MEDIA_BASE = mediaBase;

  const mediaUrl = path => `${mediaBase}/${String(path).replace(/^\/+/, "")}`;
  const preconnect = document.createElement("link");
  preconnect.rel = "preconnect";
  preconnect.href = new URL(mediaBase).origin;
  document.head.appendChild(preconnect);

  const heroPreload = document.createElement("link");
  heroPreload.rel = "preload";
  heroPreload.as = "image";
  heroPreload.href = mediaUrl("hero/hero1.jpg");
  document.head.appendChild(heroPreload);

  document.documentElement.style.setProperty(
    "--intro-photo",
    `url("${mediaUrl("intro.jpg")}")`
  );
})();
