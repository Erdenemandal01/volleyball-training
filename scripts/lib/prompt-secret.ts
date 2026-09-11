/**
 * Нууц утгыг ТЕРМИНАЛААС нуулттай уншина.
 *
 * Яагаад: нууц үгийг `--admin-password=...` гэж командын аргумент болгон
 * дамжуулбал shell history (`~/.bash_history`, PSReadLine), процессын жагсаалт
 * (`ps`, Task Manager), мөн CI-ийн лог дээр ил үлддэг. Энэ функц оронд нь
 * stdin-ээс уншиж, дэлгэц дээр цуурайтуулахгүй.
 */
import readline from 'node:readline'

export function canPromptSecret(): boolean {
  return Boolean(process.stdin.isTTY)
}

export async function promptSecret(label: string): Promise<string> {
  if (!canPromptSecret()) {
    throw new Error('Терминал интерактив биш тул нууц утга асуух боломжгүй')
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  })

  // readline-ийн гаралтыг дарж, оруулсан тэмдэгтийг цуурайтуулахгүй болгоно
  const target = rl as unknown as {
    _writeToOutput?: (s: string) => void
    output: NodeJS.WritableStream
  }
  let muted = false
  target._writeToOutput = (chunk: string) => {
    if (!muted) target.output.write(chunk)
    else if (chunk.includes(label)) target.output.write(label)
  }

  return new Promise<string>((resolve) => {
    rl.question(label, (answer) => {
      muted = false
      target.output.write('\n')
      rl.close()
      resolve(answer)
    })
    muted = true
  })
}
