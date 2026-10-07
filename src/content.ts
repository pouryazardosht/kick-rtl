/** Display-only RTL correction for Kick's virtualized chat list. */
const CHAT_ROOT_SELECTOR = "#chatroom-messages";
const TEXT_TARGET_SELECTOR = [
  '[data-kick-bidi="auto"]',
  "[data-kick-rtl-bidi]",
  '[dir="auto"]',
  "blockquote",
  '[data-testid*="reply"]',
  '[data-testid*="quote"]',
].join(", ");
const PROCESSED_ATTRIBUTE = "data-kick-rtl-bidi";
const ORIGINAL_DIR_ATTRIBUTE = "data-kick-rtl-original-dir";
const ORIGINAL_BIDI_ATTRIBUTE = "data-kick-rtl-original-bidi";
const CARD_ATTRIBUTE = "data-kick-rtl-card";
const BODY_ATTRIBUTE = "data-kick-rtl-body";
const RTL_STRONG_CHARACTER = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/u;
const LTR_STRONG_CHARACTER = /[A-Za-z\u00C0-\u02AF\u0370-\u052F]/u;
type Direction = "rtl" | "ltr";
type Mode = "smart" | "rtl" | "ltr";
type Font = "vazirmatn" | "arad" | "iransans" | "shabnam" | "system";
type Density = "compact" | "comfortable";
type Surface = "soft" | "midnight";
type Layout = "card" | "imessage" | "discord";
interface Settings {
  enabled: boolean;
  mode: Mode;
  font: Font;
  inputFont: Font;
  density: Density;
  surface: Surface;
  layout: Layout;
  bubbleWidth: number;
  fontSize: number;
  showTimestamps: boolean;
  showBadges: boolean;
  showReplies: boolean;
  userAccents: boolean;
  highlight: string;
  debugMode: boolean;
}
interface MessageParts {
  text: HTMLElement;
  row: HTMLElement;
  username: HTMLElement;
}
const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  mode: "smart",
  font: "vazirmatn",
  inputFont: "vazirmatn",
  density: "compact",
  surface: "soft",
  layout: "card",
  bubbleWidth: 100,
  fontSize: 14,
  showTimestamps: true,
  showBadges: true,
  showReplies: true,
  userAccents: true,
  highlight: "",
  debugMode: false,
};
let settings = { ...DEFAULT_SETTINGS };
let chatObserver: MutationObserver | undefined;
let activeRoot: HTMLElement | undefined;
let settingsRevision = 0;
const processedSignatures = new WeakMap<HTMLElement, string>();
const rowSignatures = new WeakMap<HTMLElement, string>();
let searchRoot: HTMLElement | undefined;
let searchInput: HTMLInputElement | undefined;
let searchCountElement: HTMLElement | undefined;
let searchWriteTimer: ReturnType<typeof setTimeout> | undefined;

const SEARCH_ROOT_ID = "kick-rtl-search-root";

function fontFamilyStack(font: Font): string | undefined {
  switch (font) {
    case "vazirmatn":
      return "Vazirmatn, Tahoma, sans-serif";
    case "arad":
      return 'Arad, "B Arad", Tahoma, sans-serif';
    case "iransans":
      return 'IRANSans, "IRANSansX", Tahoma, sans-serif';
    case "shabnam":
      return "Shabnam, Tahoma, sans-serif";
    default:
      return undefined;
  }
}
function chatChromeHost(): HTMLElement | undefined {
  if (!activeRoot) return undefined;
  return (
    activeRoot.closest<HTMLElement>("#chatroom") ??
    activeRoot.parentElement ??
    undefined
  );
}

function normalizeForSearch(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/\u064A/gu, "\u06CC")
    .replace(/\u0649/gu, "\u06CC")
    .replace(/\u0643/gu, "\u06A9")
    .toLocaleLowerCase("fa");
}

function getOverrideDirection(element?: HTMLElement): Direction | undefined {
  if (!element) return undefined;
  const override = element.getAttribute("data-kick-rtl-override");
  const normalized = override?.trim().toLowerCase();
  if (normalized === "rtl" || normalized === "ltr") return normalized;
  const force = element.getAttribute("data-kick-rtl-force")?.toLowerCase();
  if (force === "rtl" || force === "ltr") return force;
  const original =
    element.getAttribute(ORIGINAL_BIDI_ATTRIBUTE) ??
    element.getAttribute("data-kick-bidi");
  if (original === "rtl" || original === "ltr") return original;
  return undefined;
}
function firstStrongDirection(text: string): Direction | undefined {
  for (const character of text) {
    if (RTL_STRONG_CHARACTER.test(character)) return "rtl";
    if (LTR_STRONG_CHARACTER.test(character)) return "ltr";
  }
  return undefined;
}
function detectSmartDirection(text: string): Direction {
  const directionText = text
    .replace(/https?:\/\/\S+/giu, " ")
    .replace(/@\S+/gu, " ");
  const firstStrong = firstStrongDirection(directionText);
  let rtlScore = 0;
  let ltrScore = 0;
  for (const character of directionText) {
    if (RTL_STRONG_CHARACTER.test(character)) rtlScore += 1;
    else if (LTR_STRONG_CHARACTER.test(character)) ltrScore += 1;
  }
  if (rtlScore > ltrScore) return "rtl";
  if (ltrScore > rtlScore) return "ltr";
  return firstStrong ?? "ltr";
}
function directionFor(text: string, element?: HTMLElement): Direction {
  const override = getOverrideDirection(element);
  if (override) return override;
  if (settings.mode === "rtl") return "rtl";
  if (settings.mode === "ltr") return "ltr";
  return detectSmartDirection(text);
}
function saveOriginalDirection(element: HTMLElement, attribute: string): void {
  if (!element.hasAttribute(attribute))
    element.setAttribute(attribute, element.getAttribute("dir") ?? "");
}
function saveOriginalBidi(element: HTMLElement): void {
  if (!element.hasAttribute(ORIGINAL_BIDI_ATTRIBUTE))
    element.setAttribute(
      ORIGINAL_BIDI_ATTRIBUTE,
      element.getAttribute("data-kick-bidi") ?? "",
    );
}
function restoreDirection(element: HTMLElement, attribute: string): void {
  const original = element.getAttribute(attribute);
  if (original === null) return;
  if (original === "") element.removeAttribute("dir");
  else element.setAttribute("dir", original);
  element.removeAttribute(attribute);
}
function restoreBidi(element: HTMLElement): void {
  const original = element.getAttribute(ORIGINAL_BIDI_ATTRIBUTE);
  if (original === null) return;
  if (original === "") element.removeAttribute("data-kick-bidi");
  else element.setAttribute("data-kick-bidi", original);
  element.removeAttribute(ORIGINAL_BIDI_ATTRIBUTE);
}
function restoreText(element: HTMLElement): void {
  restoreDirection(element, ORIGINAL_DIR_ATTRIBUTE);
  restoreBidi(element);
  element.removeAttribute(PROCESSED_ATTRIBUTE);
}
function restoreCard(parts: MessageParts): void {
  parts.row.removeAttribute(CARD_ATTRIBUTE);
  parts.text.removeAttribute(BODY_ATTRIBUTE);
  parts.username.removeAttribute("data-kick-rtl-username");
  parts.username.removeAttribute("data-kick-rtl-accent");
}
function applyText(element: HTMLElement, direction: Direction): void {
  saveOriginalDirection(element, ORIGINAL_DIR_ATTRIBUTE);
  saveOriginalBidi(element);
  if (element.getAttribute("dir") !== direction)
    element.setAttribute("dir", direction);
  element.setAttribute("data-kick-bidi", direction);
  element.setAttribute(PROCESSED_ATTRIBUTE, direction);
}
function accentFor(name: string): number {
  return [...name].reduce(
    (value, character) => (value * 31 + character.codePointAt(0)!) % 6,
    0,
  );
}
function clearHighlights(element: HTMLElement): void {
  element
    .querySelectorAll<HTMLElement>("mark[data-kick-rtl-highlight]")
    .forEach((mark) =>
      mark.replaceWith(document.createTextNode(mark.textContent ?? "")),
    );
}
function highlightMatchesInText(value: string, query: string): Node[] {
  const needle = normalizeForSearch(query);
  if (!needle) return [document.createTextNode(value)];
  const haystack = normalizeForSearch(value);
  const nodes: Node[] = [];
  let cursor = 0;
  while (cursor < value.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) {
      nodes.push(document.createTextNode(value.slice(cursor)));
      break;
    }
    if (index > cursor)
      nodes.push(document.createTextNode(value.slice(cursor, index)));
    const mark = document.createElement("mark");
    mark.dataset.kickRtlHighlight = "true";
    mark.textContent = value.slice(index, index + query.length);
    nodes.push(mark);
    cursor = index + query.length;
  }
  return nodes;
}
function applyHighlights(element: HTMLElement): void {
  clearHighlights(element);
  const query = settings.highlight.trim();
  if (!query) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      node.parentElement?.closest("mark[data-kick-rtl-highlight]")
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  nodes.forEach((node) => {
    const value = node.data;
    if (!normalizeForSearch(value).includes(normalizeForSearch(query))) return;
    const fragment = document.createDocumentFragment();
    highlightMatchesInText(value, query).forEach((part) =>
      fragment.append(part),
    );
    node.replaceWith(fragment);
  });
}
function countHighlights(root: HTMLElement): number {
  return root.querySelectorAll("mark[data-kick-rtl-highlight]").length;
}
function updateSearchCount(): void {
  if (!searchCountElement || !activeRoot) return;
  const query = settings.highlight.trim();
  if (!query) {
    searchCountElement.textContent = "";
    return;
  }
  const total = countHighlights(activeRoot);
  searchCountElement.textContent = total
    ? `${total.toLocaleString("fa-IR")} مورد`
    : "موردی نیست";
}
function removeSearchBar(): void {
  searchRoot?.remove();
  searchRoot = undefined;
  searchInput = undefined;
  searchCountElement = undefined;
}
function syncComposerInset(): void {
  const root =
    activeRoot ?? document.querySelector<HTMLElement>(CHAT_ROOT_SELECTOR);
  if (!root) return;
  const host = chatChromeHost() ?? root.parentElement;
  const composer = host?.querySelector<HTMLElement>("#chat-input-wrapper");
  const composerHeight = composer
    ? Math.ceil(composer.getBoundingClientRect().height)
    : 0;
  const rootRect = root.getBoundingClientRect();
  const composerRect = composer?.getBoundingClientRect();
  const safeTopSpace = composerRect && composerRect.top < rootRect.top + 8 ? composerHeight + 12 : 0;
  const safeBottomSpace = composerRect && composerRect.bottom > rootRect.bottom - 8 ? composerHeight + 12 : 0;
  root.style.setProperty("--kick-rtl-composer-top-space", `${safeTopSpace}px`);
  root.style.setProperty("--kick-rtl-composer-bottom-space", `${safeBottomSpace}px`);
  if (host) {
    host.style.setProperty("--kick-rtl-composer-top-space", `${safeTopSpace}px`);
    host.style.setProperty("--kick-rtl-composer-bottom-space", `${safeBottomSpace}px`);
  }
  if (!composer) {
    root.style.setProperty("--kick-rtl-composer-top-space", "96px");
    root.style.setProperty("--kick-rtl-composer-bottom-space", "96px");
    if (host) {
      host.style.setProperty("--kick-rtl-composer-top-space", "96px");
      host.style.setProperty("--kick-rtl-composer-bottom-space", "96px");
    }
  }
}
function ensureSearchBar(): void {
  if (!activeRoot || !settings.enabled) {
    removeSearchBar();
    return;
  }
  const host = chatChromeHost();
  if (!host) return;
  if (!searchRoot) {
    searchRoot = document.createElement("div");
    searchRoot.id = SEARCH_ROOT_ID;
    const label = document.createElement("label");
    label.className = "kick-rtl-search-label";
    label.textContent = "جستجو";
    searchInput = document.createElement("input");
    searchInput.type = "search";
    searchInput.className = "kick-rtl-search-input";
    searchInput.placeholder = "کلمهٔ فارسی یا انگلیسی…";
    searchInput.spellcheck = false;
    searchInput.autocomplete = "off";
    searchCountElement = document.createElement("span");
    searchCountElement.className = "kick-rtl-search-count";
    searchInput.addEventListener("input", () => {
      settings.highlight = searchInput!.value;
      refreshHighlightsOnly();
      if (searchWriteTimer) clearTimeout(searchWriteTimer);
      searchWriteTimer = setTimeout(
        () => chrome.storage.local.set({ highlight: settings.highlight }),
        280,
      );
    });
    searchRoot.append(label, searchInput, searchCountElement);
  }
  if (searchRoot.parentElement !== host) host.prepend(searchRoot);
  if (searchInput && searchInput.value !== settings.highlight)
    searchInput.value = settings.highlight;
}
function refreshHighlightsOnly(): void {
  if (!activeRoot) return;
  activeRoot
    .querySelectorAll<HTMLElement>(`[${BODY_ATTRIBUTE}]`)
    .forEach((body) => applyHighlights(body));
  updateSearchCount();
}
function applyMessage(parts: MessageParts): void {
  const content = parts.text.textContent ?? "";
  const rowSignature = `${parts.username.textContent ?? ""}\u0000${content}`;
  const previousSignature = rowSignatures.get(parts.row);
  if (previousSignature && previousSignature !== rowSignature)
    parts.text.removeAttribute("data-kick-rtl-override");
  rowSignatures.set(parts.row, rowSignature);

  if (!settings.enabled) {
    restoreText(parts.text);
    restoreCard(parts);
    parts.row.querySelector("[data-kick-rtl-override-control]")?.remove();
    processedSignatures.delete(parts.text);
    clearHighlights(parts.text);
    return;
  }
  ensureOverrideControl(parts);
  const signature = `${rowSignature}\u0000${settingsRevision}`;
  if (processedSignatures.get(parts.text) === signature) return;
  const direction = directionFor(content, parts.text);
  applyText(parts.text, direction);
  // Give each native Kick row a predictable two-line layout without moving nodes:
  // LTR identity header first, then an isolated body whose own direction is detected.
  parts.row.setAttribute(CARD_ATTRIBUTE, "true");
  parts.text.setAttribute(BODY_ATTRIBUTE, direction);
  parts.username.setAttribute("data-kick-rtl-username", "true");
  if (settings.userAccents)
    parts.username.setAttribute(
      "data-kick-rtl-accent",
      String(accentFor(parts.username.textContent ?? "")),
    );
  else parts.username.removeAttribute("data-kick-rtl-accent");
  const emoteImages = parts.text.querySelectorAll("img, svg").length;
  const emoteOnly = !parts.text.textContent?.trim() && emoteImages > 0;
  parts.text.toggleAttribute("data-kick-rtl-emote-only", emoteOnly);
  if (emoteOnly)
    parts.text.setAttribute(
      "data-kick-rtl-emote-count",
      String(Math.min(99, emoteImages)),
    );
  else parts.text.removeAttribute("data-kick-rtl-emote-count");
  applyHighlights(parts.text);
  processedSignatures.set(parts.text, signature);
}
function ensureOverrideControl(parts: MessageParts): void {
  let control = parts.row.querySelector<HTMLButtonElement>(
    "[data-kick-rtl-override-control]",
  );
  if (!control) {
    control = document.createElement("button");
    control.type = "button";
    control.setAttribute("data-kick-rtl-override-control", "true");
    control.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const current = parts.text.getAttribute("data-kick-rtl-override");
      const next = current === null ? "rtl" : current === "rtl" ? "ltr" : null;
      if (next) parts.text.setAttribute("data-kick-rtl-override", next);
      else parts.text.removeAttribute("data-kick-rtl-override");
      processedSignatures.delete(parts.text);
      applyMessage(parts);
    });
    parts.row.append(control);
  }
  const override = parts.text.getAttribute("data-kick-rtl-override");
  const label =
    override === "rtl" ? "RTL" : override === "ltr" ? "LTR" : "Auto";
  control.textContent = label;
  control.title =
    override === "rtl"
      ? "Override: RTL (click for LTR, then Auto)"
      : override === "ltr"
        ? "Override: LTR (click for Auto)"
        : "Direction: Auto (click for RTL)";
  control.setAttribute("aria-label", control.title);
}
function messagePartsFromButton(
  button: HTMLButtonElement,
): MessageParts | undefined {
  const identity = button.parentElement;
  const separator = identity?.nextElementSibling;
  const text = separator?.nextElementSibling;
  const row = identity?.parentElement;
  if (
    !(text instanceof HTMLElement) ||
    !(row instanceof HTMLElement) ||
    separator?.textContent?.trim() !== ":"
  )
    return undefined;
  return { text, row, username: button };
}
function applyStandalone(element: HTMLElement): void {
  if (!settings.enabled) {
    restoreText(element);
    processedSignatures.delete(element);
    return;
  }
  const content = element.textContent ?? "";
  const signature = `${content}\u0000${settingsRevision}`;
  if (processedSignatures.get(element) === signature) return;
  applyText(element, directionFor(content, element));
  processedSignatures.set(element, signature);
}
function applyReply(element: HTMLElement): void {
  const isReply =
    element.textContent?.includes("Replying to") ||
    element.matches(
      'blockquote, [data-testid*="reply"], [data-testid*="quote"]',
    );
  if (isReply) {
    if (settings.enabled)
      element.setAttribute("data-kick-rtl-reply-preview", "true");
    else element.removeAttribute("data-kick-rtl-reply-preview");
  } else element.removeAttribute("data-kick-rtl-reply-preview");
}
function applyWithin(node: Node): void {
  if (!(node instanceof Element)) return;
  const handledText = new Set<HTMLElement>();
  const buttons: HTMLButtonElement[] = [];
  if (
    node instanceof HTMLButtonElement &&
    node.hasAttribute("data-prevent-expand")
  )
    buttons.push(node);
  buttons.push(
    ...node.querySelectorAll<HTMLButtonElement>(
      'button[data-prevent-expand="true"]',
    ),
  );
  buttons.forEach((button) => {
    const parts = messagePartsFromButton(button);
    if (parts) {
      handledText.add(parts.text);
      applyMessage(parts);
    }
  });
  const candidates: HTMLElement[] = [];
  if (node instanceof HTMLElement && node.matches(TEXT_TARGET_SELECTOR))
    candidates.push(node);
  candidates.push(...node.querySelectorAll<HTMLElement>(TEXT_TARGET_SELECTOR));
  candidates
    .filter((element) => !handledText.has(element))
    .forEach(applyStandalone);
  const replyTargets: HTMLElement[] = [];
  if (
    node instanceof HTMLElement &&
    node.matches(
      'button[aria-haspopup], blockquote, [data-testid*="reply"], [data-testid*="quote"]',
    )
  )
    replyTargets.push(node);
  replyTargets.push(
    ...node.querySelectorAll<HTMLElement>(
      'button[aria-haspopup], blockquote, [data-testid*="reply"], [data-testid*="quote"]',
    ),
  );
  replyTargets.forEach(applyReply);
}
function refresh(): void {
  if (!activeRoot) return;
  if (settings.enabled) {
    document.documentElement.setAttribute("data-kick-rtl-active", "true");
    document.documentElement.setAttribute(
      "data-kick-rtl-chat-font",
      settings.font,
    );
    activeRoot.setAttribute("data-kick-rtl-font", settings.font);
    activeRoot.setAttribute("data-kick-rtl-density", settings.density);
    activeRoot.setAttribute("data-kick-rtl-surface", settings.surface);
    activeRoot.setAttribute("data-kick-rtl-layout", settings.layout);
    ensureSearchBar();
    document.documentElement.setAttribute(
      "data-kick-rtl-input-font",
      settings.inputFont,
    );
    const chatStack = fontFamilyStack(settings.font);
    if (chatStack) {
      activeRoot.style.setProperty("--kick-rtl-font-family", chatStack);
      document.documentElement.style.setProperty(
        "--kick-rtl-font-family",
        chatStack,
      );
    } else {
      activeRoot.style.removeProperty("--kick-rtl-font-family");
      document.documentElement.style.removeProperty("--kick-rtl-font-family");
    }
    const inputStack = fontFamilyStack(settings.inputFont);
    if (inputStack)
      document.documentElement.style.setProperty(
        "--kick-rtl-input-font-family",
        inputStack,
      );
    else
      document.documentElement.style.removeProperty(
        "--kick-rtl-input-font-family",
      );
    activeRoot.style.setProperty(
      "--kick-rtl-bubble-max",
      `${Math.min(100, Math.max(50, settings.bubbleWidth))}%`,
    );
    activeRoot.style.setProperty(
      "--kick-rtl-font-size",
      `${Math.min(22, Math.max(11, settings.fontSize))}px`,
    );
    activeRoot.toggleAttribute(
      "data-kick-rtl-hide-timestamps",
      !settings.showTimestamps,
    );
    activeRoot.toggleAttribute(
      "data-kick-rtl-hide-badges",
      !settings.showBadges,
    );
    activeRoot.toggleAttribute(
      "data-kick-rtl-hide-replies",
      !settings.showReplies,
    );
    activeRoot.toggleAttribute("data-kick-rtl-debug", settings.debugMode);
    syncComposerInset();
  } else {
    document.documentElement.removeAttribute("data-kick-rtl-active");
    document.documentElement.removeAttribute("data-kick-rtl-chat-font");
    activeRoot.removeAttribute("data-kick-rtl-font");
    activeRoot.removeAttribute("data-kick-rtl-density");
    activeRoot.removeAttribute("data-kick-rtl-surface");
    activeRoot.removeAttribute("data-kick-rtl-layout");
    document.documentElement.removeAttribute("data-kick-rtl-input-font");
    document.documentElement.style.removeProperty(
      "--kick-rtl-input-font-family",
    );
    document.documentElement.style.removeProperty("--kick-rtl-font-family");
    removeSearchBar();
    activeRoot.style.removeProperty("--kick-rtl-bubble-max");
    activeRoot.style.removeProperty("--kick-rtl-font-family");
    activeRoot.style.removeProperty("--kick-rtl-font-size");
    activeRoot.removeAttribute("data-kick-rtl-hide-timestamps");
    activeRoot.removeAttribute("data-kick-rtl-hide-badges");
    activeRoot.removeAttribute("data-kick-rtl-hide-replies");
    activeRoot.removeAttribute("data-kick-rtl-debug");
  }
  applyWithin(activeRoot);
  updateSearchCount();
}
function attach(root: HTMLElement): void {
  if (activeRoot === root) return;
  chatObserver?.disconnect();
  activeRoot = root;
  refresh();
  let queued = false;
  const pending = new Set<Node>();
  const flush = (): void => {
    queued = false;
    pending.forEach((node) => {
      if (node instanceof Text) {
        const target = node.parentElement?.closest<HTMLElement>(
          `${TEXT_TARGET_SELECTOR}, button[data-prevent-expand="true"]`,
        );
        applyWithin(target ?? node.parentElement ?? node);
      } else {
        applyWithin(node);
      }
    });
    pending.clear();
  };
  chatObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      if (record.type === "childList") {
        record.addedNodes.forEach((node) => pending.add(node));
        if (record.removedNodes.length) pending.add(record.target);
      }
      if (record.type === "characterData" && record.target.parentElement)
        pending.add(record.target);
    });
    if (!queued && pending.size) {
      queued = true;
      queueMicrotask(flush);
    }
  });
  chatObserver.observe(root, {
    childList: true,
    characterData: true,
    subtree: true,
  });
}
function discover(): void {
  const root = document.querySelector<HTMLElement>(CHAT_ROOT_SELECTOR);
  if (root) attach(root);
}
const pageObserver = new MutationObserver(() => {
  if (!activeRoot || !document.documentElement.contains(activeRoot)) discover();
});
window.addEventListener("resize", () => {
  if (activeRoot) syncComposerInset();
});
chrome.storage.local.get(DEFAULT_SETTINGS, (stored: Partial<Settings>) => {
  settings = { ...DEFAULT_SETTINGS, ...stored };
  settingsRevision++;
  discover();
  pageObserver.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
});
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes.enabled) settings.enabled = changes.enabled.newValue as boolean;
  if (changes.mode) settings.mode = changes.mode.newValue as Mode;
  if (changes.font) settings.font = changes.font.newValue as Font;
  if (changes.inputFont)
    settings.inputFont = changes.inputFont.newValue as Font;
  if (changes.density) settings.density = changes.density.newValue as Density;
  if (changes.surface) settings.surface = changes.surface.newValue as Surface;
  if (changes.layout) settings.layout = changes.layout.newValue as Layout;
  if (changes.bubbleWidth)
    settings.bubbleWidth = changes.bubbleWidth.newValue as number;
  if (changes.fontSize) settings.fontSize = changes.fontSize.newValue as number;
  if (changes.showTimestamps)
    settings.showTimestamps = changes.showTimestamps.newValue as boolean;
  if (changes.showBadges)
    settings.showBadges = changes.showBadges.newValue as boolean;
  if (changes.showReplies)
    settings.showReplies = changes.showReplies.newValue as boolean;
  if (changes.userAccents)
    settings.userAccents = changes.userAccents.newValue as boolean;
  if (changes.highlight !== undefined)
    settings.highlight = changes.highlight.newValue as string;
  if (changes.debugMode)
    settings.debugMode = changes.debugMode.newValue as boolean;
  settingsRevision++;
  refresh();
});
