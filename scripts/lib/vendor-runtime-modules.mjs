import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
} from 'node:fs'
import { builtinModules } from 'node:module'
import { basename, dirname, join, resolve } from 'node:path'

const BUILTIN_MODULES = new Set(
  builtinModules.flatMap(name =>
    name.startsWith('node:') ? [name, name.slice('node:'.length)] : [name, `node:${name}`],
  ),
)

export const RUNTIME_WORKSPACE_PACKAGES = [
  {
    name: 'audio-capture-napi',
    sourceSubpath: 'packages/audio-capture-napi',
  },
  {
    name: 'image-processor-napi',
    sourceSubpath: 'packages/image-processor-napi',
  },
  {
    name: 'modifiers-napi',
    sourceSubpath: 'packages/modifiers-napi',
  },
  {
    name: 'url-handler-napi',
    sourceSubpath: 'packages/url-handler-napi',
  },
  {
    name: '@ant/claude-for-chrome-mcp',
    sourceSubpath: 'packages/claude-for-chrome-mcp',
  },
  {
    name: '@ant/computer-use-input',
    sourceSubpath: 'packages/computer-use-input',
  },
  {
    name: '@ant/computer-use-mcp',
    sourceSubpath: 'packages/computer-use-mcp',
  },
  {
    name: '@ant/computer-use-swift',
    sourceSubpath: 'packages/computer-use',
  },
]

const RUNTIME_WORKSPACE_PACKAGE_NAMES = new Set(
  RUNTIME_WORKSPACE_PACKAGES.map(pkg => pkg.name),
)

function toPosixPath(value) {
  return value.replaceAll('\\', '/')
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function resolvePackageInstallSubpath(packageName) {
  return toPosixPath(join('vendor', 'modules', 'node_modules', ...packageName.split('/')))
}

function walkFiles(dir) {
  const results = []

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...walkFiles(fullPath))
      continue
    }
    results.push(fullPath)
  }

  return results
}

function extractBareSpecifiers(source) {
  const specifiers = new Set()
  const patterns = [
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"`]*?\s+from\s+)?['"]([^'"]+)['"]/g,
    /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
    /(?:^|[^\w$.])import\(\s*['"]([^'"]+)['"]\s*\)/g,
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1]
      if (!specifier || specifier.startsWith('.') || specifier.startsWith('/')) {
        continue
      }
      if (specifier.startsWith('node:') || specifier.startsWith('bun:')) {
        continue
      }
      if (BUILTIN_MODULES.has(specifier)) {
        continue
      }
      specifiers.add(normalizePackageName(specifier))
    }
  }

  return [...specifiers].sort()
}

function normalizePackageName(specifier) {
  if (specifier.startsWith('@')) {
    return specifier.split('/').slice(0, 2).join('/')
  }
  return specifier.split('/')[0]
}

function collectWorkspaceRuntimeDependencies(packageDir) {
  const packageJson = readJson(join(packageDir, 'package.json'))
  const declaredDependencies = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]

  const sourceFiles = walkFiles(join(packageDir, 'src')).filter(path =>
    /\.(?:[cm]?js|tsx?)$/.test(path),
  )

  const scannedDependencies = sourceFiles.flatMap(path =>
    extractBareSpecifiers(readFileSync(path, 'utf8')),
  )

  return [...new Set([...declaredDependencies, ...scannedDependencies])]
    .filter(name => !RUNTIME_WORKSPACE_PACKAGE_NAMES.has(name))
    .sort()
}

function copyPackageDir(sourceDir, targetDir) {
  rmSync(targetDir, { recursive: true, force: true })
  mkdirSync(dirname(targetDir), { recursive: true })
  cpSync(sourceDir, targetDir, { recursive: true, dereference: true })
}

function findNearestNodeModulesDir(packageDir) {
  let currentDir = packageDir

  while (true) {
    const parentDir = dirname(currentDir)
    if (parentDir === currentDir) {
      return null
    }
    if (basename(parentDir) === 'node_modules') {
      return parentDir
    }
    currentDir = parentDir
  }
}

function resolveInstalledPackageDir(rootDir, packageName, sourceDir = null) {
  const candidates = []
  const packageSubpath = packageName.split('/')

  if (sourceDir) {
    const dependencyRoot = findNearestNodeModulesDir(sourceDir)
    if (dependencyRoot) {
      candidates.push(resolve(dependencyRoot, ...packageSubpath))
    }
  }

  candidates.push(resolve(rootDir, 'node_modules', ...packageSubpath))

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return realpathSync(candidate)
    }
  }

  throw new Error(
    `未找到已安装依赖: ${packageName} (${candidates.join(', ')})`,
  )
}

function readInstalledPackageDependencies(rootDir, sourceDir) {
  const packageJsonPath = join(sourceDir, 'package.json')
  if (!existsSync(packageJsonPath)) {
    return []
  }

  const packageJson = readJson(packageJsonPath)
  return [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]
    .filter(dependencyName => {
      try {
        resolveInstalledPackageDir(rootDir, dependencyName, sourceDir)
        return true
      } catch {
        return false
      }
    })
    .sort()
}

export function prepareVendorRuntime({ rootDir, packageDir, rootPkg }) {
  const modulesDir = join(packageDir, 'vendor', 'modules')
  const nodeModulesDir = join(modulesDir, 'node_modules')
  mkdirSync(nodeModulesDir, { recursive: true })

  const externalDependencies = {}
  const workspacePackages = {}

  for (const workspacePackage of RUNTIME_WORKSPACE_PACKAGES) {
    const sourceDir = resolve(rootDir, workspacePackage.sourceSubpath)
    const targetDir = join(nodeModulesDir, ...workspacePackage.name.split('/'))
    const runtimeDependencies = collectWorkspaceRuntimeDependencies(sourceDir)

    copyPackageDir(sourceDir, targetDir)

    workspacePackages[workspacePackage.name] = {
      sourceSubpath: workspacePackage.sourceSubpath,
      installSubpath: resolvePackageInstallSubpath(workspacePackage.name),
      runtimeDependencies,
    }

    for (const dependencyName of runtimeDependencies) {
      const dependencyVersion =
        rootPkg.dependencies?.[dependencyName] ??
        rootPkg.optionalDependencies?.[dependencyName] ??
        rootPkg.devDependencies?.[dependencyName]

      if (!dependencyVersion) {
        throw new Error(
          `workspace 运行时依赖未在根 package.json 中声明: ${workspacePackage.name} -> ${dependencyName}`,
        )
      }

      externalDependencies[dependencyName] = dependencyVersion
    }
  }

  return {
    manifestSection: {
      nodePath: 'vendor/modules/node_modules',
      workspacePackages,
      externalDependencies: Object.fromEntries(
        Object.entries(externalDependencies).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    },
    runtimeDependencies: Object.fromEntries(
      Object.entries(externalDependencies).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  }
}

export function copyInstalledDependencyTree({
  rootDir,
  targetNodeModulesDir,
  dependencyNames,
}) {
  mkdirSync(targetNodeModulesDir, { recursive: true })

  const copied = new Set()
  const queue = [...new Set(dependencyNames)].sort().map(dependencyName => ({
    dependencyName,
    parentSourceDir: null,
  }))

  while (queue.length > 0) {
    const nextDependency = queue.shift()
    if (!nextDependency || copied.has(nextDependency.dependencyName)) {
      continue
    }

    const sourceDir = resolveInstalledPackageDir(
      rootDir,
      nextDependency.dependencyName,
      nextDependency.parentSourceDir,
    )
    const targetDir = join(
      targetNodeModulesDir,
      ...nextDependency.dependencyName.split('/'),
    )

    copyPackageDir(sourceDir, targetDir)
    copied.add(nextDependency.dependencyName)

    for (const transitiveDependency of readInstalledPackageDependencies(
      rootDir,
      sourceDir,
    )) {
      if (!copied.has(transitiveDependency)) {
        queue.push({
          dependencyName: transitiveDependency,
          parentSourceDir: sourceDir,
        })
      }
    }
  }

  return [...copied].sort()
}

export function summarizeVendorWorkspacePackages() {
  return RUNTIME_WORKSPACE_PACKAGES.map(pkg => pkg.name)
}

export function getRuntimeWorkspacePackageMap() {
  return new Map(
    RUNTIME_WORKSPACE_PACKAGES.map(pkg => [pkg.name, pkg.sourceSubpath]),
  )
}
