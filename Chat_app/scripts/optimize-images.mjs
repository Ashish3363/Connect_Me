// One-off: compress the large drone photos in /Photo into web-ready WebP
// files under src/assets/locality. Re-run with: npm run optimize:images
import { mkdir, readdir } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SRC = resolve(__dirname, '../Photo')
const OUT = resolve(__dirname, '../src/assets/locality')

await mkdir(OUT, { recursive: true })

const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png)$/i.test(f)).sort()

let n = 1
for (const file of files) {
  const out = join(OUT, `locality-${n}.webp`)
  await sharp(join(SRC, file))
    .resize({ width: 1920, withoutEnlargement: true })
    .webp({ quality: 76 })
    .toFile(out)
  console.log(`✓ ${file} -> ${out}`)
  n += 1
}
console.log(`Done: ${files.length} image(s) optimized.`)
