/** Tiny DOM helper: h("div", { class: "x", hidden: true }, "text", child). */
type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | number | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    if (k === "hidden") el.hidden = true;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) {
    if (c === null || c === undefined || c === false || c === "") continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}
