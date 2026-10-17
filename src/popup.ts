type PopupFont = "vazirmatn" | "arad" | "iransans" | "shabnam" | "system";
type PopupLayout = "card" | "imessage" | "discord" | "fast";
type VisualPreset = "custom" | "minimal" | "classic" | "imessage" | "discord" | "fast" | "aurora";
interface PopupSettings {
  enabled: boolean;
  mode: "smart" | "rtl" | "ltr";
  layout: PopupLayout;
  visualPreset: VisualPreset;
  font: PopupFont;
  inputFont: PopupFont;
  density: "compact" | "comfortable";
  surface: "soft" | "midnight" | "aurora";
  popupFont: PopupFont;
  fontSize: number;
  showTimestamps: boolean;
  showBadges: boolean;
  showReplies: boolean;
  userAccents: boolean;
  debugMode: boolean;
  reducedMotion: boolean;
  readingMode: boolean;
}
type ChannelSettings = Record<string, Partial<PopupSettings>>;

const defaults: PopupSettings = {
  enabled: true, mode: "smart", layout: "card", visualPreset: "classic",
  font: "vazirmatn", inputFont: "vazirmatn", density: "compact", surface: "soft",
  popupFont: "vazirmatn", fontSize: 14, showTimestamps: true, showBadges: true,
  showReplies: true, userAccents: true, debugMode: false, reducedMotion: false, readingMode: true,
};
const visualPresets: Record<Exclude<VisualPreset, "custom">, Partial<PopupSettings>> = {
  minimal: { layout: "fast", density: "compact", surface: "midnight", fontSize: 13, showTimestamps: false, showBadges: false, showReplies: false, userAccents: false },
  classic: { layout: "card", density: "compact", surface: "soft", fontSize: 14, showTimestamps: true, showBadges: true, showReplies: true, userAccents: true },
  imessage: { layout: "imessage", density: "comfortable", surface: "soft", fontSize: 14, showTimestamps: true, showBadges: true, showReplies: true, userAccents: true },
  discord: { layout: "discord", density: "compact", surface: "midnight", fontSize: 14, showTimestamps: true, showBadges: true, showReplies: false, userAccents: true },
  fast: { layout: "fast", density: "compact", surface: "midnight", fontSize: 13, showTimestamps: true, showBadges: true, showReplies: false, userAccents: true },
  aurora: { layout: "card", density: "comfortable", surface: "aurora", fontSize: 15, showTimestamps: true, showBadges: true, showReplies: true, userAccents: true },
};

const $ = <T extends HTMLElement>(selector: string): T => document.querySelector<T>(selector)!;
const enabledInput = $<HTMLInputElement>("#enabled");
const modeInput = $<HTMLSelectElement>("#mode");
const layoutInput = $<HTMLSelectElement>("#layout");
const visualPresetInput = $<HTMLInputElement>("#visualPreset");
const fontInput = $<HTMLSelectElement>("#font");
const inputFontInput = $<HTMLSelectElement>("#inputFont");
const densityInput = $<HTMLSelectElement>("#density");
const surfaceInput = $<HTMLSelectElement>("#surface");
const popupFontInput = $<HTMLSelectElement>("#popupFont");
const fontSizeInput = $<HTMLInputElement>("#fontSize");
const fontSizeValue = $<HTMLOutputElement>("#fontSizeValue");
const showTimestampsInput = $<HTMLInputElement>("#showTimestamps");
const showBadgesInput = $<HTMLInputElement>("#showBadges");
const showRepliesInput = $<HTMLInputElement>("#showReplies");
const userAccentsInput = $<HTMLInputElement>("#userAccents");
const debugModeInput = $<HTMLInputElement>("#debugMode");
const reducedMotionInput = $<HTMLInputElement>("#reducedMotion");
const readingModeInput = $<HTMLInputElement>("#readingMode");
const perChannelInput = $<HTMLInputElement>("#perChannel");
const statusElement = $<HTMLElement>("#status");
const channelName = $<HTMLElement>("#channelName");
const preview = $<HTMLElement>("#chatPreview");
const reloadButton = $<HTMLButtonElement>("#reload");
const importFile = $<HTMLInputElement>("#importFile");
const resetButton = $<HTMLButtonElement>("#resetSettings");
const presetButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-preset]"));
const dependentControls = document.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLButtonElement>(".main-controls input, .main-controls select, .main-controls button, .advanced input, .advanced select, .channel-card input");

let globalSettings = { ...defaults };
let channelSettings: ChannelSettings = {};
let activeChannel: string | undefined;

function channelFromUrl(url?: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    if (!/(^|\.)kick\.com$/iu.test(parsed.hostname)) return undefined;
    const channel = parsed.pathname.split("/").filter(Boolean)[0];
    return channel && !/^(categories|search|following|settings|signup|login)$/iu.test(channel)
      ? channel.toLowerCase() : undefined;
  } catch { return undefined; }
}
function formatPx(value: number): string { return `${value.toLocaleString("fa-IR")}px`; }
function effectiveSettings(): PopupSettings {
  return { ...globalSettings, ...(activeChannel ? channelSettings[activeChannel] : {}) };
}
function updatePreview(settings: PopupSettings): void {
  preview.dataset.layout = settings.layout;
  preview.dataset.density = settings.density;
  preview.style.fontSize = `${settings.fontSize}px`;
  preview.style.fontFamily = settings.font === "system" ? "inherit" : `${settings.font}, Tahoma, sans-serif`;
}
function render(settings: PopupSettings): void {
  enabledInput.checked = settings.enabled; modeInput.value = settings.mode; layoutInput.value = settings.layout;
  visualPresetInput.value = settings.visualPreset; fontInput.value = settings.font; inputFontInput.value = settings.inputFont;
  densityInput.value = settings.density; surfaceInput.value = settings.surface; popupFontInput.value = settings.popupFont;
  fontSizeInput.value = String(settings.fontSize); fontSizeValue.textContent = formatPx(settings.fontSize);
  showTimestampsInput.checked = settings.showTimestamps; showBadgesInput.checked = settings.showBadges;
  showRepliesInput.checked = settings.showReplies; userAccentsInput.checked = settings.userAccents;
  debugModeInput.checked = settings.debugMode; reducedMotionInput.checked = settings.reducedMotion; readingModeInput.checked = settings.readingMode;
  perChannelInput.checked = !!(activeChannel && channelSettings[activeChannel]);
  perChannelInput.disabled = !activeChannel;
  channelName.textContent = activeChannel ? `کانال ${activeChannel}` : "در یک کانال Kick باز کنید";
  resetButton.textContent = activeChannel && perChannelInput.checked ? "بازنشانی کانال" : "بازنشانی عمومی";
  document.documentElement.dataset.font = settings.popupFont;
  document.documentElement.dataset.popupTheme = settings.surface === "aurora" ? "aurora" : "default";
  dependentControls.forEach((control) => { control.disabled = !settings.enabled || (control === perChannelInput && !activeChannel); });
  statusElement.textContent = settings.enabled ? "افزونه فعال است" : "افزونه غیرفعال است";
  statusElement.classList.toggle("is-off", !settings.enabled);
  presetButtons.forEach((button) => button.classList.toggle("is-selected", button.dataset.preset === settings.visualPreset));
  updatePreview(settings);
}
function readSettings(): PopupSettings {
  return {
    enabled: enabledInput.checked, mode: modeInput.value as PopupSettings["mode"], layout: layoutInput.value as PopupLayout,
    visualPreset: visualPresetInput.value as VisualPreset, font: fontInput.value as PopupFont, inputFont: inputFontInput.value as PopupFont,
    density: densityInput.value as PopupSettings["density"], surface: surfaceInput.value as PopupSettings["surface"], popupFont: popupFontInput.value as PopupFont,
    fontSize: Number(fontSizeInput.value), showTimestamps: showTimestampsInput.checked, showBadges: showBadgesInput.checked,
    showReplies: showRepliesInput.checked, userAccents: userAccentsInput.checked, debugMode: debugModeInput.checked,
    reducedMotion: reducedMotionInput.checked, readingMode: readingModeInput.checked,
  };
}
function persist(markCustom = false): void {
  if (markCustom) visualPresetInput.value = "custom";
  const next = readSettings();
  if (activeChannel && perChannelInput.checked) {
    channelSettings = { ...channelSettings, [activeChannel]: next };
    chrome.storage.local.set({ channelSettings }, () => render(next));
  } else {
    globalSettings = next;
    chrome.storage.local.set(next, () => render(next));
  }
}
function applyPreset(preset: Exclude<VisualPreset, "custom">): void {
  const next = { ...readSettings(), ...visualPresets[preset], visualPreset: preset };
  Object.entries(next).forEach(([key, value]) => {
    const input = document.querySelector<HTMLInputElement | HTMLSelectElement>(`#${key}`);
    if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = Boolean(value);
    else if (input) input.value = String(value);
  });
  persist();
}
function toggleChannelScope(): void {
  if (!activeChannel) return;
  if (perChannelInput.checked) {
    channelSettings = { ...channelSettings, [activeChannel]: readSettings() };
  } else {
    const { [activeChannel]: _removed, ...remaining } = channelSettings;
    channelSettings = remaining;
  }
  chrome.storage.local.set({ channelSettings }, () => render(effectiveSettings()));
}
function setStatusError(message: string): void {
  statusElement.textContent = message;
  statusElement.classList.add("is-off");
}
function resetCurrentScope(): void {
  const channelScoped = !!(activeChannel && perChannelInput.checked);
  const message = channelScoped
    ? "تنظیمات اختصاصی این کانال پاک شود؟"
    : "تنظیمات عمومی افزونه به حالت پیش‌فرض برگردد؟";
  if (!window.confirm(message)) return;
  if (channelScoped && activeChannel) {
    const { [activeChannel]: _removed, ...remaining } = channelSettings;
    channelSettings = remaining;
    chrome.storage.local.set({ channelSettings }, () => render(effectiveSettings()));
    return;
  }
  globalSettings = { ...defaults };
  chrome.storage.local.set(globalSettings, () => render(effectiveSettings()));
}

chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  activeChannel = channelFromUrl(tabs[0]?.url);
  chrome.storage.local.get({ ...defaults, channelSettings: {} }, (stored) => {
    const { channelSettings: savedChannels, ...savedGlobal } = stored as Partial<PopupSettings> & { channelSettings?: ChannelSettings };
    globalSettings = { ...defaults, ...savedGlobal };
    channelSettings = savedChannels ?? {};
    render(effectiveSettings());
  });
});

enabledInput.addEventListener("change", () => persist());
modeInput.addEventListener("change", () => persist());
layoutInput.addEventListener("change", () => persist(true));
densityInput.addEventListener("change", () => persist(true));
surfaceInput.addEventListener("change", () => persist(true));
fontSizeInput.addEventListener("input", () => { fontSizeValue.textContent = formatPx(Number(fontSizeInput.value)); persist(true); });
[fontInput, inputFontInput, popupFontInput].forEach((input) => input.addEventListener("change", () => persist()));
[showTimestampsInput, showBadgesInput, showRepliesInput, userAccentsInput, debugModeInput, reducedMotionInput, readingModeInput].forEach((input) => input.addEventListener("change", () => persist(true)));
perChannelInput.addEventListener("change", toggleChannelScope);
presetButtons.forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset as Exclude<VisualPreset, "custom">)));
reloadButton.addEventListener("click", () => chrome.tabs.reload(undefined, { bypassCache: true }, () => { if (chrome.runtime.lastError) setStatusError("صفحهٔ Kick در دسترس نیست"); }));
resetButton.addEventListener("click", resetCurrentScope);
document.querySelector<HTMLButtonElement>("#exportSettings")!.addEventListener("click", () => {
  chrome.storage.local.get({ ...defaults, channelSettings: {} }, (settings) => {
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: "application/json" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = "kick-rtl-settings.json"; link.click(); URL.revokeObjectURL(link.href);
  });
});
document.querySelector<HTMLButtonElement>("#importSettings")!.addEventListener("click", () => importFile.click());
importFile.addEventListener("change", () => {
  const file = importFile.files?.[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const imported = JSON.parse(String(reader.result)) as Record<string, unknown>;
      const allowed = Object.fromEntries(Object.keys(defaults).filter((key) => key in imported).map((key) => [key, imported[key]]));
      const importedChannels = typeof imported.channelSettings === "object" && imported.channelSettings ? { channelSettings: imported.channelSettings } : {};
      chrome.storage.local.set({ ...allowed, ...importedChannels }, () => {
        globalSettings = { ...globalSettings, ...allowed } as PopupSettings;
        if (importedChannels.channelSettings) channelSettings = importedChannels.channelSettings as ChannelSettings;
        render(effectiveSettings());
      });
    } catch { setStatusError("فایل تنظیمات معتبر نیست"); }
  };
  reader.readAsText(file); importFile.value = "";
});
