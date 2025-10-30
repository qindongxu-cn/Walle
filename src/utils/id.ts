/** 生成总字符长度为 16 的 id */
export const id = () => {
  const box = new Uint8Array(8)
  crypto.getRandomValues(box)
  const tokens: string[] = []
  box.forEach((num) => tokens.push(num.toString(16).padStart(2, '0')))
  return tokens.join('')
}
