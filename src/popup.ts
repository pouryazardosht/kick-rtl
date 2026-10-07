type PopupFont = "vazirmatn" | "arad" | "iransans" | "shabnam" | "system";
interface PopupSettings {
  enabled: boolean;
  mode: "smart" | "rtl";
  font: PopupFont;
  inputFont: PopupFont;
  density: "compact" | "comfortable";
  surface: "soft" | "midnight";
  popupFont: PopupFont;
}
const defaults: PopupSettings = {
  enabled: true,
  mode: "smart",
  font: "vazirmatn",
  inputFont: "vazirmatn",
  density: "compact",
  surface: "soft",
  popupFont: "vazirmatn",
};
const enabledInput = document.querySelector<HTMLInputElement>("#enabled")!;
const modeInput = document.querySelector<HTMLSelectElement>("#mode")!;
const fontInput = document.querySelector<HTMLSelectElement>("#font")!;
const inputFontInput = document.querySelector<HTMLSelectElement>("#inputFont")!;
const densityInput = document.querySelector<HTMLSelectElement>("#density")!;
const surfaceInput = document.querySelector<HTMLSelectElement>("#surface")!;
const popupFontInput = document.querySelector<HTMLSelectElement>("#popupFont")!;
const statusElement = document.querySelector<HTMLElement>("#status")!;
const reloadButton = document.querySelector<HTMLButtonElement>("#reload")!;

function render(settings: PopupSettings): void {
  enabledInput.checked = settings.enabled;
  modeInput.value = settings.mode;
  fontInput.value = settings.font;
  inputFontInput.value = settings.inputFont;
  densityInput.value = settings.density;
  surfaceInput.value = settings.surface;
  popupFontInput.value = settings.popupFont;
  document.documentElement.dataset.font = settings.popupFont;
  modeInput.disabled = !settings.enabled;
  fontInput.disabled = !settings.enabled;
  inputFontInput.disabled = !settings.enabled;
  densityInput.disabled = !settings.enabled;
  surfaceInput.disabled = !settings.enabled;
  statusElement.textContent = settings.enabled ? "فعال" : "غیرفعال";
  statusElement.classList.toggle("is-off", !settings.enabled);
}
function save(): void {
  const settings: PopupSettings = {
    enabled: enabledInput.checked,
    mode: modeInput.value as PopupSettings["mode"],
    font: fontInput.value as PopupFont,
    inputFont: inputFontInput.value as PopupFont,
    density: densityInput.value as PopupSettings["density"],
    surface: surfaceInput.value as PopupSettings["surface"],
    popupFont: popupFontInput.value as PopupFont,
  };
  chrome.storage.local.set(settings);
  render(settings);
}
chrome.storage.local.get(defaults, (stored: Partial<PopupSettings>) =>
  render({ ...defaults, ...stored }),
);
enabledInput.addEventListener("change", save);
modeInput.addEventListener("change", save);
fontInput.addEventListener("change", save);
inputFontInput.addEventListener("change", save);
densityInput.addEventListener("change", save);
surfaceInput.addEventListener("change", save);
popupFontInput.addEventListener("change", save);
reloadButton.addEventListener("click", () =>
  chrome.tabs.reload(undefined, { bypassCache: true }),
);
