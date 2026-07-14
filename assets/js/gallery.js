const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxCaption = document.querySelector("[data-lightbox-caption]");
const lightboxClose = document.querySelector("[data-lightbox-close]");
const lightboxPrev = document.querySelector("[data-lightbox-prev]");
const lightboxNext = document.querySelector("[data-lightbox-next]");
const galleryButtons = document.querySelectorAll("[data-lightbox-gallery] button");

let lastFocusedElement = null;
let activeGalleryButtons = [];
let activeIndex = -1;

const closeLightbox = () => {
  if (!lightbox || !lightboxImage || !lightboxCaption) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.removeAttribute("src");
  lightboxImage.alt = "";
  lightboxCaption.textContent = "";
  document.body.style.overflow = "";
  activeGalleryButtons = [];
  activeIndex = -1;
  lastFocusedElement?.focus();
};

const updateNavigation = () => {
  const hasMultipleImages = activeGalleryButtons.length > 1;
  if (lightboxPrev) lightboxPrev.hidden = !hasMultipleImages;
  if (lightboxNext) lightboxNext.hidden = !hasMultipleImages;
};

const showLightboxImage = (index) => {
  if (!lightbox || !lightboxImage || !lightboxCaption) return;
  if (!activeGalleryButtons.length) return;

  activeIndex = (index + activeGalleryButtons.length) % activeGalleryButtons.length;
  const button = activeGalleryButtons[activeIndex];
  const fullImage = button.dataset.full;
  const caption = button.dataset.caption || "";
  const thumbnail = button.querySelector("img");

  if (!fullImage || !thumbnail) return;

  lightboxImage.src = fullImage;
  lightboxImage.alt = thumbnail.alt;
  lightboxCaption.textContent = activeGalleryButtons.length > 1
    ? `${caption}${caption ? " - " : ""}${activeIndex + 1}/${activeGalleryButtons.length}`
    : caption;
  updateNavigation();
};

const moveLightbox = (step) => {
  if (!lightbox?.classList.contains("is-open")) return;
  if (activeGalleryButtons.length <= 1) return;
  showLightboxImage(activeIndex + step);
};

const openLightbox = (button) => {
  if (!lightbox || !lightboxImage || !lightboxCaption) return;
  const gallery = button.closest("[data-lightbox-gallery]");
  activeGalleryButtons = gallery ? [...gallery.querySelectorAll("button[data-full]")] : [button];
  activeIndex = activeGalleryButtons.indexOf(button);
  if (activeIndex < 0) activeIndex = 0;

  lastFocusedElement = button;
  showLightboxImage(activeIndex);
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  lightboxClose?.focus();
};

galleryButtons.forEach((button) => {
  button.addEventListener("click", () => openLightbox(button));
});

lightboxClose?.addEventListener("click", closeLightbox);
lightboxPrev?.addEventListener("click", () => moveLightbox(-1));
lightboxNext?.addEventListener("click", () => moveLightbox(1));

lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if (!lightbox?.classList.contains("is-open")) return;

  if (event.key === "Escape") {
    event.preventDefault();
    closeLightbox();
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    moveLightbox(-1);
  }

  if (event.key === "ArrowRight") {
    event.preventDefault();
    moveLightbox(1);
  }
});
