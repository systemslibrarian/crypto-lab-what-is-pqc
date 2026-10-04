/** Small DOM helpers. No cryptography, no state. */

type Attrs = Record<string, string>

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value)
  for (const child of children) node.append(child)
  return node
}

/** Throws rather than returning null: a missing mount point is a build error,
 *  and an empty region is exactly what an accessibility scan calls perfect. */
export function mount(id: string): HTMLElement {
  const node = document.getElementById(id)
  if (!node) throw new Error(`missing mount point #${id}`)
  return node
}

export function clear(node: HTMLElement): void {
  node.replaceChildren()
}
