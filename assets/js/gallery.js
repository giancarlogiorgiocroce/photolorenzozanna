const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxCaption = document.querySelector("[data-lightbox-caption]");
const lightboxClose = document.querySelector("[data-lightbox-close]");
const galleryButtons = document.querySelectorAll("[data-lightbox-gallery] button");

let lastFocusedElement = null;

const closeLightbox = () => {
  if (!lightbox || !lightboxImage || !lightboxCaption) return;
  lightbox.classList.remove("is-open");
  lightbox.setAttribute("aria-hidden", "true");
  lightboxImage.removeAttribute("src");
  lightboxImage.alt = "";
  lightboxCaption.textContent = "";
  document.body.style.overflow = "";
  lastFocusedElement?.focus();
};

const openLightbox = (button) => {
  if (!lightbox || !lightboxImage || !lightboxCaption) return;
  const fullImage = button.dataset.full;
  const caption = button.dataset.caption || "";
  const thumbnail = button.querySelector("img");

  if (!fullImage || !thumbnail) return;

  lastFocusedElement = button;
  lightboxImage.src = fullImage;
  lightboxImage.alt = thumbnail.alt;
  lightboxCaption.textContent = caption;
  lightbox.classList.add("is-open");
  lightbox.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  lightboxClose?.focus();
};

galleryButtons.forEach((button) => {
  button.addEventListener("click", () => openLightbox(button));
});

lightboxClose?.addEventListener("click", closeLightbox);

lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && lightbox?.classList.contains("is-open")) {
    closeLightbox();
  }
});
