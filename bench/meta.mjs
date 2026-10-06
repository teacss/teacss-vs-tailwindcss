import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getPackageInfo } from 'local-pkg'

export const dir = dirname(fileURLToPath(import.meta.url))

export const targets = [
  'none',
  'tailwindcss-vite',
  'teacss-vite',
]

export const targetPkgMap = {
  'tailwindcss-vite': '@tailwindcss/vite',
  'teacss-vite': 'teacss',
  'none': 'none',
}

const pkgs = [
  'vite',
  'teacss',
  '@tailwindcss/vite',
]

export async function getVersions() {
  const versions = Object.fromEntries(
    await Promise.all(
      pkgs.map(async i => [
        i,
        (await getPackageInfo(i))?.packageJson?.version,
      ]),
    ),
  )

  return versions
}
