export const MAX_CHAT_ITEMS = 6;
export const MAX_CHAT_ITEM_LENGTH = 240;
export const MAX_CHAT_FOOTER_LENGTH = 240;

// Shared by the API and UI so malformed or legacy responses stay safe to render.
export function normalizeChatContent(payload = {}) {
  payload = payload && typeof payload === 'object' ? payload : {};
  const items = [];
  const seenItems = new Set();

  for (const item of Array.isArray(payload.items) ? payload.items : []) {
    const text = trimText(item).slice(0, MAX_CHAT_ITEM_LENGTH).trim();
    const normalizedText = text.toLocaleLowerCase().replace(/\s+/g, ' ');

    if (!text || seenItems.has(normalizedText)) {
      continue;
    }

    seenItems.add(normalizedText);
    items.push(text);

    if (items.length === MAX_CHAT_ITEMS) {
      break;
    }
  }

  const listType = trimText(payload.listType);

  return {
    message: trimText(payload.message),
    items,
    listType: items.length && (listType === 'bullet' || listType === 'numbered')
      ? listType
      : null,
    footer: trimText(payload.footer).slice(0, MAX_CHAT_FOOTER_LENGTH).trim()
  };
}

// Include list content and footer in history without changing the history limits.
export function chatMessageToHistory({ role, content, items = [], listType, footer = '' }) {
  return {
    role,
    content: [
      content,
      items.map((item, index) => `${listType === 'numbered' ? `${index + 1}.` : '-'} ${item}`).join('\n'),
      footer
    ].filter(Boolean).join('\n\n')
  };
}

function trimText(value) {
  return typeof value === 'string' ? value.trim() : '';
}
