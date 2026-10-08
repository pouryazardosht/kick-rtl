type PopupFont = "vazirmatn" | "arad" | "iransans" | "shabnam" | "system";
type PopupLayout = "card" | "imessage" | "discord" | "fast";
type VisualPreset = "custom" | "minimal" | "imessage" | "discord";
interface PopupSettings {
  enabled: boolean;
  mode: "smart" | "rtl" | "ltr";
  layout: PopupLayout;
  visualPreset: VisualPreset;
  font: PopupFont;
  inputFont: PopupFont;
  density: "compact" | "comfortable";
  surface: "soft" | "midnight";
  popupFont: PopupFont;
  bubbleWidth: number;
  fontSize: number;
  showTimestamps: boolean;
  showBadges: boolean;
  showReplies: boolean;
  userAccents: boolean;
  debugMode: boolean;
}
const defaults: PopupSettings = {
  enabled: true,
  mode: "smart",
  layout: "card",
  visualPreset: "custom",
  font: "vazirmatn",
  inputFont: "vazirmatn",
  density: "compact",
  surface: "soft",
  popupFont: "vazirmatn",
  bubbleWidth: 100,
  fontSize: 14,
  showTimestamps: true,
  showBadges: true,
  showReplies: true,
  userAccents: true,
  debugMode: false,
};
const visualPresets: Record<Exclude<VisualPreset, "custom">, Partial<PopupSettings>> = {
  minimal: {
    layout: "fast",
    density: "compact",
    surface: "midnight",
    bubbleWidth: 100,
    fontSize: 13,
    showTimestamps: false,
    showBadges: false,
    showReplies: false,
    userAccents: false,
  },
  imessage: {
    layout: "imessage",
    density: "comfortable",
    surface: "soft",
    bubbleWidth: 86,
    fontSize: 14,
    showTimestamps: true,
    showBadges: true,
    showReplies: true,
    userAccents: true,
  },
  discord: {
    layout: "discord",
    density: "compact",
    surface: "midnight",
    bubbleWidth: 100,
    fontSize: 14,
    showTimestamps: true,
    showBadges: true,
    showReplies: false,
    userAccents: true,
  },
};

const enabledInput = document.querySelector<HTMLInputElement>("#enabled")!;
const modeInput = document.querySelector<HTMLSelectElement>("#mode")!;
const layoutInput = document.querySelector<HTMLSelectElement>("#layout")!;
const visualPresetInput = document.querySelector<HTMLSelectElement>("#visualPreset")!;
const fontInput = document.querySelector<HTMLSelectElement>("#font")!;
const inputFontInput = document.querySelector<HTMLSelectElement>("#inputFont")!;
const densityInput = document.querySelector<HTMLSelectElement>("#density")!;
const surfaceInput = document.querySelector<HTMLSelectElement>("#surface")!;
const popupFontInput = document.querySelector<HTMLSelectElement>("#popupFont")!;
const bubbleWidthInput = document.querySelector<HTMLInputElement>("#bubbleWidth")!;
const bubbleWidthValue = document.querySelector<HTMLOutputElement>("#bubbleWidthValue")!;
const fontSizeInput = document.querySelector<HTMLInputElement>("#fontSize")!;
const fontSizeValue = document.querySelector<HTMLOutputElement>("#fontSizeValue")!;
const showTimestampsInput = document.querySelector<HTMLInputElement>("#showTimestamps")!;
const showBadgesInput = document.querySelector<HTMLInputElement>("#showBadges")!;
const showRepliesInput = document.querySelector<HTMLInputElement>("#showReplies")!;
const userAccentsInput = document.querySelector<HTMLInputElement>("#userAccents")!;
const debugModeInput = document.querySelector<HTMLInputElement>("#debugMode")!;
const statusElement = document.querySelector<HTMLElement>("#status")!;
const reloadButton = document.querySelector<HTMLButtonElement>("#reload")!;
const dependentControls = document.querySelectorAll<
  HTMLInputElement | HTMLSelectElement
>(".card input:not(#enabled), .card select");

function formatPercent(value: number): string {
  return `${value.toLocaleString("fa-IR")}٪`;
}
function formatPx(value: number): string {
  return `${value.toLocaleString("fa-IR")}px`;
}
function render(settings: PopupSettings): void {
  enabledInput.checked = settings.enabled;
  modeInput.value = settings.mode;
  layoutInput.value = settings.layout;
  visualPresetInput.value = settings.visualPreset;
  fontInput.value = settings.font;
  inputFontInput.value = settings.inputFont;
  densityInput.value = settings.density;
  surfaceInput.value = settings.surface;
  popupFontInput.value = settings.popupFont;
  bubbleWidthInput.value = String(settings.bubbleWidth);
  bubbleWidthValue.textContent = formatPercent(settings.bubbleWidth);
  fontSizeInput.value = String(settings.fontSize);
  fontSizeValue.textContent = formatPx(settings.fontSize);
  showTimestampsInput.checked = settings.showTimestamps;
  showBadgesInput.checked = settings.showBadges;
  showRepliesInput.checked = settings.showReplies;
  userAccentsInput.checked = settings.userAccents;
  debugModeInput.checked = settings.debugMode;
  document.documentElement.dataset.font = settings.popupFont;
  dependentControls.forEach((control) => {
    control.disabled = !settings.enabled;
  });
  statusElement.textContent = settings.enabled ? "فعال" : "غیرفعال";
  statusElement.classList.toggle("is-off", !settings.enabled);
}
function readSettings(): PopupSettings {
  return {
    enabled: enabledInput.checked,
    mode: modeInput.value as PopupSettings["mode"],
    layout: layoutInput.value as PopupLayout,
    visualPreset: visualPresetInput.value as VisualPreset,
    font: fontInput.value as PopupFont,
    inputFont: inputFontInput.value as PopupFont,
    density: densityInput.value as PopupSettings["density"],
    surface: surfaceInput.value as PopupSettings["surface"],
    popupFont: popupFontInput.value as PopupFont,
    bubbleWidth: Number(bubbleWidthInput.value),
    fontSize: Number(fontSizeInput.value),
    showTimestamps: showTimestampsInput.checked,
    showBadges: showBadgesInput.checked,
    showReplies: showRepliesInput.checked,
    userAccents: userAccentsInput.checked,
    debugMode: debugModeInput.checked,
  };
}
function save(markVisualPresetCustom = false): void {
  if (markVisualPresetCustom) visualPresetInput.value = "custom";
  const settings = readSettings();
  chrome.storage.local.set(settings, () => {
    if (chrome.runtime.lastError) {
      statusElement.textContent = "ذخیره نشد";
      statusElement.classList.add("is-off");
      return;
    }
    render(settings);
  });
}

function applyVisualPreset(): void {
  const preset = visualPresetInput.value as VisualPreset;
  if (preset === "custom") {
    save();
    return;
  }
  const settings: PopupSettings = {
    ...readSettings(),
    ...visualPresets[preset],
    visualPreset: preset,
  };
  chrome.storage.local.set(settings, () => {
    if (chrome.runtime.lastError) {
      statusElement.textContent = "ذخیره نشد";
      statusElement.classList.add("is-off");
      return;
    }
    render(settings);
  });
}

chrome.storage.local.get(defaults, (stored: Partial<PopupSettings>) => {
  if (chrome.runtime.lastError) {
    statusElement.textContent = "تنظیمات بارگذاری نشد";
    statusElement.classList.add("is-off");
    return;
  }
  render({ ...defaults, ...stored });
});
enabledInput.addEventListener("change", () => save());
modeInput.addEventListener("change", () => save());
layoutInput.addEventListener("change", () => save(true));
visualPresetInput.addEventListener("change", applyVisualPreset);
fontInput.addEventListener("change", () => save());
inputFontInput.addEventListener("change", () => save());
densityInput.addEventListener("change", () => save(true));
surfaceInput.addEventListener("change", () => save(true));
popupFontInput.addEventListener("change", () => save());
bubbleWidthInput.addEventListener("input", () => {
  bubbleWidthValue.textContent = formatPercent(Number(bubbleWidthInput.value));
  save(true);
});
fontSizeInput.addEventListener("input", () => {
  fontSizeValue.textContent = formatPx(Number(fontSizeInput.value));
  save(true);
});
showTimestampsInput.addEventListener("change", () => save(true));
showBadgesInput.addEventListener("change", () => save(true));
showRepliesInput.addEventListener("change", () => save(true));
userAccentsInput.addEventListener("change", () => save(true));
debugModeInput.addEventListener("change", () => save());
reloadButton.addEventListener("click", () => {
  chrome.tabs.reload(undefined, { bypassCache: true }, () => {
    if (chrome.runtime.lastError) {
      statusElement.textContent = "صفحهٔ Kick در دسترس نیست";
      statusElement.classList.add("is-off");
    }
  });
});
