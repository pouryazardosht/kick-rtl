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
  debugMode: false,
};
let settings = { ...DEFAULT_SETTINGS };
let chatObserver: MutationObserver | undefined;
let activeRoot: HTMLElement | undefined;
let settingsRevision = 0;
let layoutFrame: number | undefined;
let observedComposer: HTMLElement | undefined;
let observedViewport: HTMLElement | undefined;
let composerResizeObserver: ResizeObserver | undefined;
let viewportResizeObserver: ResizeObserver | undefined;
const processedSignatures = new WeakMap<HTMLElement, string>();
const rowSignatures = new WeakMap<HTMLElement, string>();
const originalRootMargins = new WeakMap<HTMLElement, string>();
const originalViewportPadding = new WeakMap<HTMLElement, string>();
const reservedViewportForRoot = new WeakMap<HTMLElement, HTMLElement>();
const JUMP_LATEST_ROOT_ID = "kick-rtl-jump-latest";
let jumpLatestRoot: HTMLButtonElement | undefined;
let jumpLatestCount: HTMLElement | undefined;
let jumpScrollViewport: HTMLElement | undefined;
let lastMessageIndex: number | undefined;
let unseenMessageCount = 0;
let initialLatestScrollScheduled = false;

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

function chatComposer(root: HTMLElement): HTMLElement | undefined {
  return (
    root.closest<HTMLElement>("#chatroom")?.querySelector("#chat-input-wrapper") ??
    document.querySelector<HTMLElement>("#chat-input-wrapper") ??
    undefined
  );
}

function scrollViewportFor(root: HTMLElement): HTMLElement | undefined {
  let ancestor = root.parentElement;
  while (ancestor && ancestor !== document.body) {
    const overflowY = getComputedStyle(ancestor).overflowY;
    if (/(auto|scroll|overlay)/u.test(overflowY) && ancestor.clientHeight > 0)
      return ancestor;
    ancestor = ancestor.parentElement;
  }
  return root.parentElement ?? undefined;
}

function rememberStyle(
  cache: WeakMap<HTMLElement, string>,
  element: HTMLElement,
  property: "margin-bottom" | "scroll-padding-bottom",
): void {
  if (!cache.has(element)) cache.set(element, element.style.getPropertyValue(property));
}

function restoreComposerInset(root: HTMLElement): void {
  const originalMargin = originalRootMargins.get(root);
  if (originalMargin !== undefined) {
    root.style.setProperty("margin-bottom", originalMargin);
    originalRootMargins.delete(root);
  }
  const viewport = reservedViewportForRoot.get(root);
  if (!viewport) return;
  const originalPadding = originalViewportPadding.get(viewport);
  if (originalPadding !== undefined) {
    viewport.style.setProperty("scroll-padding-bottom", originalPadding);
    originalViewportPadding.delete(viewport);
  }
  reservedViewportForRoot.delete(root);
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
function syncComposerInset(): void {
  const root =
    activeRoot ?? document.querySelector<HTMLElement>(CHAT_ROOT_SELECTOR);
  if (!root) return;
  const host = chatChromeHost() ?? root.parentElement;
  const composer = chatComposer(root);
  const viewport = scrollViewportFor(root);
  if (!viewport) return;
  const previousViewport = reservedViewportForRoot.get(root);
  if (previousViewport && previousViewport !== viewport) {
    const previousPadding = originalViewportPadding.get(previousViewport);
    if (previousPadding !== undefined) {
      previousViewport.style.setProperty("scroll-padding-bottom", previousPadding);
      originalViewportPadding.delete(previousViewport);
    }
  }
  const viewportRect = viewport.getBoundingClientRect();
  const composerRect = composer?.getBoundingClientRect();
  const overlapsViewport =
    composerRect &&
    composerRect.bottom > viewportRect.top &&
    composerRect.top < viewportRect.bottom;
  const safeTopSpace =
    overlapsViewport && composerRect.top <= viewportRect.top + 8
      ? Math.ceil(Math.min(composerRect.bottom, viewportRect.bottom) - viewportRect.top) + 12
      : 0;
  const safeBottomSpace =
    overlapsViewport && composerRect.bottom >= viewportRect.bottom - 8
      ? Math.ceil(viewportRect.bottom - Math.max(composerRect.top, viewportRect.top)) + 12
      : 0;
  root.style.setProperty("--kick-rtl-composer-top-space", `${safeTopSpace}px`);
  root.style.setProperty("--kick-rtl-composer-bottom-space", `${safeBottomSpace}px`);
  rememberStyle(originalRootMargins, root, "margin-bottom");
  rememberStyle(originalViewportPadding, viewport, "scroll-padding-bottom");
  reservedViewportForRoot.set(root, viewport);
  root.style.setProperty("margin-bottom", `${safeBottomSpace}px`);
  viewport.style.setProperty("scroll-padding-bottom", `${safeBottomSpace}px`);
  if (host) {
    host.style.setProperty("--kick-rtl-composer-top-space", `${safeTopSpace}px`);
    host.style.setProperty("--kick-rtl-composer-bottom-space", `${safeBottomSpace}px`);
  }
  updateJumpLatestPosition();
}

function scheduleComposerInset(): void {
  if (layoutFrame !== undefined) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = undefined;
    if (activeRoot && settings.enabled) {
      syncComposerInset();
      updateJumpLatest();
    }
  });
}

function observeComposerInset(root: HTMLElement): void {
  const composer = chatComposer(root);
  const viewport = scrollViewportFor(root);
  if (composer !== observedComposer) {
    composerResizeObserver?.disconnect();
    composerResizeObserver = undefined;
    observedComposer = composer;
    if (composer) {
      composerResizeObserver = new ResizeObserver(scheduleComposerInset);
      composerResizeObserver.observe(composer);
    }
  }
  if (viewport !== observedViewport) {
    viewportResizeObserver?.disconnect();
    viewportResizeObserver = undefined;
    observedViewport = viewport;
  }
  if (viewport && !viewportResizeObserver) {
    viewportResizeObserver = new ResizeObserver(scheduleComposerInset);
    viewportResizeObserver.observe(viewport);
  }
  observeJumpViewport(viewport);
  scheduleComposerInset();
}

function highestVirtualMessageIndex(root: HTMLElement): number | undefined {
  let highest: number | undefined;
  root.querySelectorAll<HTMLElement>("[data-index]").forEach((element) => {
    const index = Number(element.dataset.index);
    if (Number.isFinite(index) && (highest === undefined || index > highest))
      highest = index;
  });
  return highest;
}

function unreadMessagesFromNativeDivider(root: HTMLElement): number {
  const rows = Array.from(root.querySelectorAll<HTMLElement>("[data-index]"));
  const divider = rows.find((row) =>
    /new messages|پیام(?:‌| )های جدید/iu.test(row.textContent ?? ""),
  );
  const dividerIndex = divider ? Number(divider.dataset.index) : Number.NaN;
  if (!Number.isFinite(dividerIndex)) return 0;
  return rows.filter((row) => {
    const index = Number(row.dataset.index);
    return (
      Number.isFinite(index) &&
      index > dividerIndex &&
      !!row.querySelector('button[data-prevent-expand="true"]')
    );
  }).length;
}

function isAtLatest(viewport: HTMLElement): boolean {
  const remaining = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop;
  return remaining <= Math.max(40, viewport.clientHeight * 0.04);
}

function formatUnreadCount(count: number): string {
  return count > 99 ? "۹۹+" : count.toLocaleString("fa-IR");
}

function updateJumpLatestPosition(): void {
  if (!jumpLatestRoot || !activeRoot) return;
  const host = chatChromeHost();
  const composer = chatComposer(activeRoot);
  if (!host || !composer) return;
  const hostRect = host.getBoundingClientRect();
  const composerRect = composer.getBoundingClientRect();
  const offset = Math.max(12, Math.ceil(hostRect.bottom - composerRect.top) + 12);
  jumpLatestRoot.style.setProperty("--kick-rtl-jump-bottom", `${offset}px`);
}

function updateJumpLatest(): void {
  if (!jumpLatestRoot || !activeRoot || !jumpScrollViewport) return;
  const atLatest = isAtLatest(jumpScrollViewport);
  const currentIndex = highestVirtualMessageIndex(activeRoot);
  const dividerUnread = unreadMessagesFromNativeDivider(activeRoot);
  if (atLatest) {
    unseenMessageCount = 0;
    lastMessageIndex = currentIndex;
  } else {
    if (dividerUnread) unseenMessageCount = dividerUnread;
    else if (
      currentIndex !== undefined &&
      lastMessageIndex !== undefined &&
      currentIndex > lastMessageIndex
    ) {
      unseenMessageCount += currentIndex - lastMessageIndex;
    }
    if (currentIndex !== undefined) lastMessageIndex = currentIndex;
  }
  jumpLatestRoot.hidden = atLatest;
  jumpLatestRoot.setAttribute(
    "aria-label",
    unseenMessageCount
      ? `رفتن به آخرین پیام‌ها؛ ${formatUnreadCount(unseenMessageCount)} پیام جدید`
      : "رفتن به آخرین پیام‌ها",
  );
  if (jumpLatestCount) {
    jumpLatestCount.hidden = unseenMessageCount === 0;
    jumpLatestCount.textContent = formatUnreadCount(unseenMessageCount);
  }
  updateJumpLatestPosition();
}

function jumpToLatest(): void {
  if (!jumpScrollViewport) return;
  unseenMessageCount = 0;
  jumpScrollViewport.scrollTo({
    top: jumpScrollViewport.scrollHeight,
    behavior: "smooth",
  });
  requestAnimationFrame(updateJumpLatest);
}

function scrollToLatestOnInitialLoad(): void {
  if (initialLatestScrollScheduled) return;
  initialLatestScrollScheduled = true;
  let pass = 0;
  const settleAtLatest = (): void => {
    const root = activeRoot;
    const viewport = root ? scrollViewportFor(root) : undefined;
    if (!root || !viewport) return;
    const hasMessages = root.querySelector("[data-index]") !== null;
    if (hasMessages || pass >= 12) viewport.scrollTop = viewport.scrollHeight;
    pass += 1;
    if (pass < 3 || (!hasMessages && pass < 12)) {
      requestAnimationFrame(settleAtLatest);
      return;
    }
    updateJumpLatest();
  };
  requestAnimationFrame(settleAtLatest);
}

function observeJumpViewport(viewport: HTMLElement | undefined): void {
  if (jumpScrollViewport === viewport) return;
  jumpScrollViewport?.removeEventListener("scroll", updateJumpLatest);
  jumpScrollViewport = viewport;
  jumpScrollViewport?.addEventListener("scroll", updateJumpLatest, {
    passive: true,
  });
  updateJumpLatest();
}

function ensureJumpLatestButton(): void {
  if (!activeRoot || !settings.enabled) {
    removeJumpLatestButton();
    return;
  }
  const host = chatChromeHost();
  if (!host) return;
  if (!jumpLatestRoot) {
    jumpLatestRoot = document.createElement("button");
    jumpLatestRoot.id = JUMP_LATEST_ROOT_ID;
    jumpLatestRoot.type = "button";
    jumpLatestRoot.innerHTML =
      '<span class="kick-rtl-jump-icon" aria-hidden="true">↓</span><span>آخرین پیام‌ها</span><span class="kick-rtl-jump-count" hidden></span>';
    jumpLatestCount =
      jumpLatestRoot.querySelector<HTMLElement>(".kick-rtl-jump-count") ??
      undefined;
    jumpLatestRoot.addEventListener("click", jumpToLatest);
  }
  if (jumpLatestRoot.parentElement !== host) host.append(jumpLatestRoot);
  const viewport = scrollViewportFor(activeRoot);
  observeJumpViewport(viewport);
  if (lastMessageIndex === undefined)
    lastMessageIndex = highestVirtualMessageIndex(activeRoot);
  updateJumpLatest();
}

function removeJumpLatestButton(): void {
  jumpLatestRoot?.remove();
  jumpLatestRoot = undefined;
  jumpLatestCount = undefined;
  jumpScrollViewport?.removeEventListener("scroll", updateJumpLatest);
  jumpScrollViewport = undefined;
  lastMessageIndex = undefined;
  unseenMessageCount = 0;
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
    ensureJumpLatestButton();
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
    observeComposerInset(activeRoot);
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
    removeJumpLatestButton();
    activeRoot.style.removeProperty("--kick-rtl-bubble-max");
    activeRoot.style.removeProperty("--kick-rtl-font-family");
    activeRoot.style.removeProperty("--kick-rtl-font-size");
    activeRoot.removeAttribute("data-kick-rtl-hide-timestamps");
    activeRoot.removeAttribute("data-kick-rtl-hide-badges");
    activeRoot.removeAttribute("data-kick-rtl-hide-replies");
    activeRoot.removeAttribute("data-kick-rtl-debug");
    restoreComposerInset(activeRoot);
    composerResizeObserver?.disconnect();
    composerResizeObserver = undefined;
    viewportResizeObserver?.disconnect();
    viewportResizeObserver = undefined;
    observedComposer = undefined;
    observedViewport = undefined;
  }
  applyWithin(activeRoot);
}
function attach(root: HTMLElement): void {
  if (activeRoot === root) return;
  chatObserver?.disconnect();
  if (activeRoot) restoreComposerInset(activeRoot);
  activeRoot = root;
  refresh();
  scrollToLatestOnInitialLoad();
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
    updateJumpLatest();
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
  else if (
    settings.enabled &&
    (!observedComposer || !document.documentElement.contains(observedComposer))
  ) {
    // The composer can mount after the virtual list and can resize with a
    // multiline draft. A frame-debounced remeasure keeps the last message
    // reachable without making message mutations expensive.
    observeComposerInset(activeRoot);
  }
});
window.addEventListener("resize", () => {
  if (activeRoot) scheduleComposerInset();
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
  if (changes.debugMode)
    settings.debugMode = changes.debugMode.newValue as boolean;
  settingsRevision++;
  refresh();
});
