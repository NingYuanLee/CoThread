import type { ReactElement, SVGProps } from "react";

/**
 * 文件类型图标。
 *
 * 之前这块依赖 @react-symbols/icons：它的 files chunk 有 535 KB，内联 650 个品牌 SVG，
 * 首屏构建产物里多出一个 463 KB 的 chunk。这里改成项目自持实现：
 *
 * - Document / Markdown / Notebook / Python / Text 这 5 个图标按原样保留，
 *   视觉与之前一致；未知扩展名沿用同一个文档页图标（旧实现的默认图标就是它）；
 * - 其余品牌图标按类别收敛成 10 个项目自绘图标；
 * - 扩展名与文件名的解析规则保持不变：优先最长复合扩展名（d.ts、env.example），
 *   其次最后一段扩展名；autoAssign 命中完整文件名时优先于扩展名。
 *   同一类文件仍然拿到同一个图标。
 *
 * 许可：
 * - 原样保留的 5 个图标来自 @react-symbols/icons（MIT，Copyright (c) 2022 Pablo Hernández）。
 * - 类别图标来自 Lucide（ISC，https://lucide.dev）。
 */

export function DocumentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
      <path
        stroke="#64748B"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M6 3a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8a1 1 0 00-.375-.78l-5-4A1 1 0 0013 3H6z"
      />
      <path stroke="#64748B" strokeLinejoin="round" strokeWidth="2" d="M12 4v5h6" />
    </svg>
  );
}

export function MarkdownIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
      <path
        fill="#60A5FA"
        d="M3 15.714V8h2.323l2.322 2.836L9.968 8h2.322v7.714H9.968V11.29l-2.323 2.836-2.322-2.836v4.424H3zm14.516 0l-3.484-3.743h2.323V8h2.322v3.97H21l-3.484 3.744z"
      />
    </svg>
  );
}

export function NotebookIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
      <path
        stroke="#60A5FA"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M19 4a1 1 0 00-1-1H8a3 3 0 00-3 3v12a3 3 0 003 3h10a1 1 0 001-1V4z"
      />
      <rect width="14" height="2" x="5" y="16" fill="#60A5FA" rx="1" />
    </svg>
  );
}

export function PythonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
      <path
        fill="#14B8A6"
        fillRule="evenodd"
        d="M14.622 21.322c-.6.11-1.284.174-1.999.178a12.52 12.52 0 01-2.179-.178c-1.136-.198-2.092-1.086-2.092-2.269v-4.156c0-1.217.93-2.217 2.092-2.217h4.178c1.418 0 2.613-1.271 2.613-2.712V7.974h1.438c1.216 0 1.926.92 2.223 2.213.401 1.735.384 2.773 0 4.435-.332 1.45-1.398 2.212-2.613 2.212H12.531v.555h4.183v1.664c0 1.26-.322 1.942-2.092 2.269zm-.176-2.837c-.532 0-.963.45-.963 1.005 0 .555.43 1.005.963 1.005.532 0 .963-.45.963-1.005 0-.555-.43-1.005-.963-1.005z"
        clipRule="evenodd"
      />
      <path
        fill="#14B8A6"
        fillRule="evenodd"
        d="M9.378 2.678c.6-.11 1.284-.174 1.999-.178.715-.003 1.46.053 2.179.178 1.136.198 2.092 1.086 2.092 2.269v4.156c0 1.217-.93 2.217-2.092 2.217H9.378c-1.418 0-2.613 1.271-2.613 2.712v1.994H5.327c-1.216 0-1.926-.92-2.223-2.213-.401-1.735-.384-2.773 0-4.435.332-1.45 1.397-2.213 2.613-2.213H11.469v-.554H7.286V4.947c0-1.26.322-1.942 2.092-2.269zm.176 2.838c.532 0 .963-.45.963-1.005 0-.555-.43-1.006-.963-1.006-.532 0-.964.45-.964 1.006 0 .555.432 1.005.964 1.005z"
        clipRule="evenodd"
      />
    </svg>
  );
}

export function TextIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
      <rect width="16" height="2" x="4" y="6" fill="#64748B" rx="1" />
      <rect width="12" height="2" x="4" y="11" fill="#64748B" rx="1" />
      <rect width="16" height="2" x="4" y="16" fill="#64748B" rx="1" />
    </svg>
  );
}

/** 类别图标：图片。 */
export function ImageIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

/** 类别图标：视频。 */
export function VideoIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m16 13 5.223 3.482A.5.5 0 0 0 22 16.066V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
      <rect x="2" y="6" width="14" height="12" rx="2" />
    </svg>
  );
}

/** 类别图标：音频。 */
export function AudioIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

/** 类别图标：压缩包与安装包。 */
export function ArchiveIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="2" y="4" width="20" height="5" rx="1" />
      <path d="M4 9v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9" />
      <path d="M10 13h4" />
    </svg>
  );
}

/** 类别图标：源码。 */
export function CodeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m16 18 6-6-6-6" />
      <path d="m8 6-6 6 6 6" />
    </svg>
  );
}

/** 类别图标：配置。 */
export function ConfigIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 4H14" />
      <path d="M10 4H3" />
      <path d="M21 12H12" />
      <path d="M8 12H3" />
      <path d="M21 20H16" />
      <path d="M12 20H3" />
      <path d="M14 2v4" />
      <path d="M8 10v4" />
      <path d="M16 18v4" />
    </svg>
  );
}

/** 类别图标：结构化数据。 */
export function DataIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14a9 3 0 0 0 18 0V5" />
      <path d="M3 12a9 3 0 0 0 18 0" />
    </svg>
  );
}

/** 类别图标：字体。 */
export function FontIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M4 7V4h16v3" />
      <path d="M9 20h6" />
      <path d="M12 4v16" />
    </svg>
  );
}

/** 类别图标：可执行文件与二进制。 */
export function BinaryIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <rect x="9" y="9" width="6" height="6" rx="1" />
      <path d="M9 2v2" />
      <path d="M15 2v2" />
      <path d="M9 20v2" />
      <path d="M15 20v2" />
      <path d="M2 9h2" />
      <path d="M2 15h2" />
      <path d="M20 9h2" />
      <path d="M20 15h2" />
    </svg>
  );
}

/** PDF：沿用文档页外形，底部加一条红色标记，与 W/P 角标区分开。 */
export function PdfIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" {...props}>
      <path
        stroke="#64748B"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M6 3a1 1 0 00-1 1v16a1 1 0 001 1h12a1 1 0 001-1V8a1 1 0 00-.375-.78l-5-4A1 1 0 0013 3H6z"
      />
      <path stroke="#64748B" strokeLinejoin="round" strokeWidth="2" d="M12 4v5h6" />
      <rect x="7.2" y="15" width="9.6" height="3" rx="1" fill="#d93025" />
    </svg>
  );
}

export type FileIconComponent = (props: SVGProps<SVGSVGElement>) => ReactElement;

/** 扩展名或完整文件名到图标的映射，与旧实现同构：调用方可以覆盖任意键。 */
export type FileIconMap = Record<string, FileIconComponent>;

/** 扩展名 -> 图标。键集与旧实现一致，复合扩展名（d.ts、env.example）也在其中。 */
const EXTENSION_ICON_GROUPS: Array<[FileIconComponent, string[]]> = [
  [DocumentIcon, ["htaccess"]],
  [MarkdownIcon, ["md"]],
  [NotebookIcon, ["ipynb"]],
  [PythonIcon, ["py", "python"]],
  [TextIcon, ["txt"]],
  [PdfIcon, ["pdf"]],
  [
    ImageIcon,
    [
      "gif",
      "svg",
      "png",
      "jpeg",
      "jpg",
      "ico",
      "tif",
      "tiff",
      "psd",
      "psb",
      "ami",
      "apx",
      "avif",
      "bmp",
      "bpg",
      "brk",
      "cur",
      "dds",
      "dng",
      "exr",
      "fpx",
      "gbr",
      "img",
      "jbig2",
      "jb2",
      "jng",
      "jxr",
      "pgf",
      "pic",
      "raw",
      "webp",
      "eps",
      "afphoto",
      "ase",
      "aseprite",
      "clip",
      "cpt",
      "heif",
      "heic",
      "kra",
      "mdp",
      "ora",
      "pdn",
      "reb",
      "sai",
      "tga",
      "xcf",
      "jfif",
      "ppm",
      "pbm",
      "pgm",
      "pnm",
      "svgx",
    ],
  ],
  [
    VideoIcon,
    [
      "webm",
      "mkv",
      "flv",
      "vob",
      "ogv",
      "ogg",
      "gifv",
      "avi",
      "mov",
      "qt",
      "wmv",
      "yuv",
      "rm",
      "rmvb",
      "mp4",
      "m4v",
      "mpg",
      "mp2",
      "mpeg",
      "mpe",
      "mpv",
      "m2v",
      "tscn",
      "scn",
    ],
  ],
  [AudioIcon, ["mp3", "flac", "m4a", "wma", "aiff", "wav"]],
  [
    ArchiveIcon,
    [
      "vsixmanifest",
      "vsix",
      "7z",
      "deb",
      "dmg",
      "gz",
      "iso",
      "rar",
      "rpm",
      "tar",
      "tar.bz2",
      "tar.gz",
      "zip",
    ],
  ],
  [
    CodeIcon,
    [
      "nim",
      "f90",
      "f95",
      "f03",
      "f",
      "for",
      "d.ts",
      "d.cts",
      "d.mts",
      "antlers.html",
      "gleam",
      "actions.ts",
      "effects.ts",
      "facade.ts",
      "reducer.ts",
      "selector.ts",
      "selectors.ts",
      "hs",
      "component.dart",
      "component.ts",
      "component.js",
      "service.dart",
      "service.ts",
      "service.js",
      "directive.dart",
      "directive.ts",
      "directive.js",
      "module.dart",
      "module.ts",
      "module.js",
      "guard.dart",
      "guard.ts",
      "guard.js",
      "pipe.dart",
      "pipe.ts",
      "pipe.js",
      "sol",
      "mdoc",
      "ml",
      "mli",
      "cmx",
      "njk",
      "nunjucks",
      "csproj",
      "ruleset",
      "sln",
      "slnx",
      "suo",
      "vb",
      "vbs",
      "vcxitems",
      "vcxitems.filters",
      "vcxproj",
      "vcxproj.filters",
      "h",
      "liquid",
      "mdx",
      "svx",
      "cfml",
      "cfc",
      "lucee",
      "cfm",
      "erl",
      "hrl",
      "haml",
      "tex",
      "sty",
      "dtx",
      "ltx",
      "drawio",
      "dio",
      "patch",
      "al",
      "http",
      "rest",
      "bru",
      "cls",
      "zig",
      "proto",
      "test.mjs",
      "spec.mjs",
      "test.js",
      "spec.js",
      "test.ts",
      "spec.ts",
      "spec.jsx",
      "test.jsx",
      "spec.tsx",
      "test.tsx",
      "ex",
      "exs",
      "eex",
      "leex",
      "heex",
      "svelte.ts",
      "blade.php",
      "twig",
      "html.twig",
      "pcss",
      "sss",
      "scala",
      "sc",
      "styl",
      "astro",
      "graphql",
      "gql",
      "rs",
      "ron",
      "swift",
      "rb",
      "erb",
      "svelte",
      "kt",
      "kts",
      "r",
      "rmd",
      "jade",
      "pug",
      "lua",
      "luau",
      "less",
      "java",
      "jsp",
      "dart",
      "freezed.dart",
      "g.dart",
      "fs",
      "fsx",
      "fsi",
      "fsproj",
      "cr",
      "cs",
      "cshtml",
      "csx",
      "jl",
      "ssh_config",
      "sh",
      "ksh",
      "csh",
      "tcsh",
      "zsh",
      "bash",
      "nu",
      "bat",
      "cmd",
      "awk",
      "fish",
      "exp",
      "ps1",
      "psm1",
      "psd1",
      "ps1xml",
      "psc1",
      "pssc",
      "go",
      "c",
      "i",
      "mi",
      "cc",
      "cpp",
      "cxx",
      "c++",
      "cp",
      "mm",
      "mii",
      "ii",
      "cu",
      "cuh",
      "jsx",
      "tsx",
      "scss",
      "sass",
      "css",
      "test",
      "js",
      "mjs",
      "cjs",
      "ts",
      "res",
      "resi",
      "html",
      "htm",
      "shtml",
      "v",
      "fc",
      "gd.uid",
      "tres",
      "gdshader.uid",
      "mdc",
    ],
  ],
  [
    ConfigIcon,
    [
      "orval",
      "env",
      "env.example",
      "earthlyignore",
      "stylelint",
      "lock",
      "cmake",
      "deno",
      "netlify",
      "vercel",
      "editorconfig",
      "jenkinsfile",
      "jenkins",
      "tsconfig.json",
      "tf",
      "tf.json",
      "tfvars",
      "tfstate",
      "stories.js",
      "stories.jsx",
      "stories.mdx",
      "story.js",
      "story.jsx",
      "stories.ts",
      "stories.tsx",
      "story.ts",
      "story.tsx",
      "stories.svelte",
      "story.mdx",
      "yml",
      "yaml",
      "yml.dist",
      "yaml.dist",
      "gradle",
      "sbt",
      "prisma",
      "pulumi",
      "go.mod",
      "dockerignore",
      "dockerfile",
      "containerignore",
      "toml",
      "nix",
      "import",
    ],
  ],
  [
    DataIcon,
    [
      "mcfunction",
      "mcmeta",
      "mcworld",
      "mcstructure",
      "mcpack",
      "mcaddon",
      "mongodb",
      "lang",
      "mo",
      "po",
      "pot",
      "pkl",
      "pdb",
      "sql",
      "pks",
      "pkb",
      "accdb",
      "mdb",
      "sqlite",
      "sqlite3",
      "pgsql",
      "postgres",
      "psql",
      "db",
      "db3",
      "xml",
      "plist",
      "xsd",
      "dtd",
      "xsl",
      "xslt",
      "resx",
      "iml",
      "xquery",
      "manifest",
      "project",
      "xml.dist",
      "xml.dist.sample",
      "dmn",
      "xlsx",
      "xlsm",
      "xls",
      "csv",
      "tsv",
      "psv",
      "ods",
      "json",
      "arb",
      "xlf",
      "xliff",
      "resw",
      "strings",
      "stringsdict",
      "ftl",
    ],
  ],
  [
    FontIcon,
    [
      "woff",
      "woff2",
      "ttf",
      "eot",
      "suit",
      "otf",
      "bmap",
      "fnt",
      "odttf",
      "ttc",
      "font",
      "fonts",
      "sui",
      "ntf",
      "mrf",
    ],
  ],
  [BinaryIcon, ["exe", "msi"]],
];

/** 完整文件名（小写）-> 图标。autoAssign 命中时优先于扩展名。 */
const FILE_NAME_ICON_GROUPS: Array<[FileIconComponent, string[]]> = [
  [
    PythonIcon,
    [
      "requirements.txt",
      "pipfile",
      ".python-version",
      "manifest.in",
      "pylintrc",
      ".pylintrc",
      "setup.cfg",
    ],
  ],
  [TextIcon, ["robots.txt"]],
  [
    CodeIcon,
    [
      "markdoc.config.ts",
      "dune",
      "dune-project",
      "dune-workspace",
      "dune-workspace.dev",
      "test.js",
      "test.ts",
      "cypress.json",
      "cypress.env.json",
      "cypress.config.ts",
      "cypress.config.js",
      "cypress.config.cjs",
      "cypress.config.mjs",
      "postcss.config.js",
      "postcss.config.cjs",
      "postcss.config.mjs",
      "postcss.config.ts",
      "postcss.config.cts",
      "postcss.config.mts",
      ".postcssrc.js",
      ".postcssrc.cjs",
      ".postcssrc.ts",
      ".postcssrc.cts",
      ".postcssrc",
      ".postcssrc.json",
      ".postcssrc.yaml",
      ".postcssrc.yml",
      ".styl",
      "astro.config.js",
      "astro.config.mjs",
      "astro.config.cjs",
      "astro.config.ts",
      "astro.config.cts",
      "astro.config.mts",
      "vitest.config.js",
      "vitest.config.mjs",
      "vitest.config.ts",
      "vitest.config.cjs",
      "vitest.config.mts",
      "vitest.config.cts",
      ".cursorrules",
      ".graphqlconfig",
      ".graphqlrc",
      ".graphqlrc.json",
      ".graphqlrc.js",
      ".graphqlrc.cjs",
      ".graphqlrc.ts",
      ".graphqlrc.toml",
      ".graphqlrc.yaml",
      ".graphqlrc.yml",
      "graphql.config.json",
      "graphql.config.js",
      "graphql.config.ts",
      "graphql.config.toml",
      "graphql.config.yaml",
      "graphql.config.yml",
      "svelte.config.js",
      "svelte.config.cjs",
      "svelte.ts",
      ".pug-lintrc",
      ".pug-lintrc.js",
      ".pug-lintrc.json",
      ".perl",
      ".luacheckrc",
      ".pubignore",
      "jest.config.js",
      "jest.config.cjs",
      "jest.config.mjs",
      "jest.config.ts",
      "jest.config.cts",
      "jest.config.mts",
      "jest.config.json",
      "jest.e2e.config.js",
      "jest.e2e.config.cjs",
      "jest.e2e.config.mjs",
      "jest.e2e.config.ts",
      "jest.e2e.config.cts",
      "jest.e2e.config.mts",
      "jest.e2e.config.json",
      "jest.e2e.json",
      "jest-unit.config.js",
      "jest-e2e.config.js",
      "jest-e2e.config.cjs",
      "jest-e2e.config.mjs",
      "jest-e2e.config.ts",
      "jest-e2e.config.cts",
      "jest-e2e.config.mts",
      "jest-e2e.config.json",
      "jest-e2e.json",
      "jest-github-actions-reporter.js",
      "jest.setup.js",
      "jest.setup.ts",
      "jest.json",
      ".jestrc",
      ".jestrc.js",
      ".jestrc.json",
      "jest.teardown.js",
      ".d.ts",
      "pre-commit",
      "commit-msg",
      "pre-push",
      "post-merge",
      "angular-cli.json",
      ".angular-cli.json",
      "angular.json",
      "tsconfig.test.json",
      "svelte.config.ts",
      "svelte.config.cts",
      ".cursorignore",
      ".cursorindexingignore",
    ],
  ],
  [
    ConfigIcon,
    [
      "orval.config.js",
      "orval.config.mjs",
      "orval.config.ts",
      "orval.config.cjs",
      "orval.config.mts",
      "orval.config.cts",
      ".orvalrc",
      ".orvalrc.js",
      ".orvalrc.json",
      ".orvalrc.ts",
      ".orvalrc.yaml",
      ".orvalrc.yml",
      ".gitlab-ci.yml",
      "file.config",
      "lunaria.config.json",
      "ec.config.mjs",
      "uno.config.js",
      "uno.config.mjs",
      "uno.config.ts",
      "uno.config.mts",
      "unocss.config.js",
      "unocss.config.mjs",
      "unocss.config.ts",
      "unocss.config.mts",
      "knip.json",
      "knip.jsonc",
      ".knip.json",
      ".knip.jsonc",
      "knip.ts",
      "knip.js",
      "knip.config.ts",
      "knip.config.js",
      "css.ts",
      "dev.vars",
      "serverless.yml",
      "gatsby-config.js",
      "gatsby-config.mjs",
      "gatsby-config.ts",
      "gatsby-node.js",
      "gatsby-node.mjs",
      "gatsby-node.ts",
      "gatsby-browser.js",
      "gatsby-browser.tsx",
      "gatsby-ssr.js",
      "gatsby-ssr.tsx",
      "panda.config.ts",
      "sanity.cli.ts",
      "sanity.config.ts",
      "sanity.theme.mjs",
      "keystatic.page.ts",
      "keystatic.config.ts",
      "bruno.json",
      "bun.lock",
      "bun.lockb",
      "bunfig.toml",
      "drizzle.config.ts",
      ".stylelintrc",
      "stylelint.config.js",
      "stylelint.config.cjs",
      ".stylelintrc.json",
      ".stylelintrc.yaml",
      ".stylelintrc.yml",
      ".stylelintrc.js",
      ".stylelintrc.cjs",
      ".stylelintignore",
      ".stylelintcache",
      "cmakelists.txt",
      "cmakecache.txt",
      "nest-cli.json",
      ".nest-cli.json",
      "nestconfig.json",
      ".nestconfig.json",
      "contentlayer.config.ts",
      "contentlayer.config.js",
      "go.mod",
      "go.sum",
      "go.work",
      "go.work.sum",
      "deno.json",
      "deno.jsonc",
      "docusaurus.config.js",
      "docusaurus.config.ts",
      "netlify.json",
      "netlify.yml",
      "netlify.yaml",
      "netlify.toml",
      ".vercel",
      "vercel.json",
      ".vercelignore",
      "now.json",
      ".nowignore",
      ".editorconfig",
      "gulpfile.js",
      "gulpfile.mjs",
      "gulpfile.ts",
      "gulpfile.cts",
      "gulpfile.mts",
      "gulpfile.babel.js",
      ".feature",
      "capacitor.config.json",
      "capacitor.config.ts",
      "ionic.config.json",
      ".io-config.json",
      "nodemon.json",
      "nodemon-debug.json",
      "jenkinsfile",
      "package.json",
      "package-lock.json",
      ".nvmrc",
      ".esmrc",
      ".node-version",
      "gradle.properties",
      "gradlew",
      "gradle-wrapper.properties",
      "prisma.yml",
      "vite.config.js",
      "vite.config.mjs",
      "vite.config.ts",
      "vite.config.cjs",
      "vite.config.mts",
      "vite.config.cts",
      "vite.base.config.js",
      "vite.base.config.mjs",
      "vite.base.config.ts",
      "vite.base.config.cjs",
      "vite.base.config.mts",
      "vite.base.config.cts",
      "vite.main.config.js",
      "vite.main.config.mjs",
      "vite.main.config.ts",
      "vite.main.config.cjs",
      "vite.main.config.mts",
      "vite.main.config.cts",
      "vite.preload.config.js",
      "vite.preload.config.mjs",
      "vite.preload.config.ts",
      "vite.preload.config.cjs",
      "vite.preload.config.mts",
      "vite.preload.config.cts",
      "vite.renderer.config.js",
      "vite.renderer.config.mjs",
      "vite.renderer.config.ts",
      "vite.renderer.config.cjs",
      "vite.renderer.config.mts",
      "vite.renderer.config.cts",
      "vite.config.electron.js",
      "vite.config.electron.mjs",
      "vite.config.electron.ts",
      "vite.config.electron.cjs",
      "vite.config.electron.mts",
      "vite.config.electron.cts",
      "gulp.config.json",
      ".babelrc",
      ".babelrc.js",
      ".babelrc.cjs",
      ".babelrc.mjs",
      ".babelrc.cts",
      ".babelrc.json",
      "babel.config.js",
      "babel.config.cjs",
      "babel.config.mjs",
      "babel.config.ts",
      "babel.config.cts",
      "babel.config.json",
      ".prettierrc",
      "prettier.config.js",
      "prettier.config.cjs",
      "prettier.config.mjs",
      ".prettierrc.js",
      ".prettierrc.cjs",
      ".prettierrc.mjs",
      ".prettierrc.json",
      ".prettierrc.json5",
      ".prettierrc.yaml",
      ".prettierrc.yml",
      ".prettierignore",
      ".prettierrc.toml",
      ".claude",
      ".clauderc",
      "claude.json",
      "claude.yaml",
      "claude.yml",
      ".claude.md",
      "claude-prompt.md",
      ".claudeignore",
      "tauri.conf.json",
      "tauri.linux.json",
      "tauri.windows.json",
      "tauri.macos.json",
      "tauri.android.json",
      "tauri.ios.json",
      "tauri.conf.toml",
      "tauri.linux.toml",
      "tauri.windows.toml",
      "tauri.macos.toml",
      "tauri.android.toml",
      "tauri.ios.toml",
      "pulumi.yaml",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      ".pnpmfile.cjs",
      ".npmignore",
      ".npmrc",
      "pyproject.toml",
      "dockerfile",
      "dockerfile.prod",
      "dockerfile.production",
      "dockerfile.alpha",
      "dockerfile.beta",
      "dockerfile.stage",
      "dockerfile.staging",
      "dockerfile.dev",
      "dockerfile.development",
      "dockerfile.local",
      "dockerfile.test",
      "dockerfile.testing",
      "dockerfile.ci",
      "dockerfile.web",
      "dockerfile.worker",
      "docker-compose.yml",
      "docker-compose.override.yml",
      "docker-compose.prod.yml",
      "docker-compose.production.yml",
      "docker-compose.alpha.yml",
      "docker-compose.beta.yml",
      "docker-compose.stage.yml",
      "docker-compose.staging.yml",
      "docker-compose.dev.yml",
      "docker-compose.development.yml",
      "docker-compose.local.yml",
      "docker-compose.test.yml",
      "docker-compose.testing.yml",
      "docker-compose.ci.yml",
      "docker-compose.web.yml",
      "docker-compose.worker.yml",
      "docker-compose.yaml",
      "docker-compose.override.yaml",
      "docker-compose.prod.yaml",
      "docker-compose.production.yaml",
      "docker-compose.alpha.yaml",
      "docker-compose.beta.yaml",
      "docker-compose.stage.yaml",
      "docker-compose.staging.yaml",
      "docker-compose.dev.yaml",
      "docker-compose.development.yaml",
      "docker-compose.local.yaml",
      "docker-compose.test.yaml",
      "docker-compose.testing.yaml",
      "docker-compose.ci.yaml",
      "docker-compose.web.yaml",
      "docker-compose.worker.yaml",
      "compose.yml",
      "compose.override.yml",
      "compose.prod.yml",
      "compose.production.yml",
      "compose.alpha.yml",
      "compose.beta.yml",
      "compose.stage.yml",
      "compose.staging.yml",
      "compose.dev.yml",
      "compose.development.yml",
      "compose.local.yml",
      "compose.test.yml",
      "compose.testing.yml",
      "compose.ci.yml",
      "compose.web.yml",
      "compose.worker.yml",
      "compose.yaml",
      "compose.override.yaml",
      "compose.prod.yaml",
      "compose.production.yaml",
      "compose.alpha.yaml",
      "compose.beta.yaml",
      "compose.stage.yaml",
      "compose.staging.yaml",
      "compose.dev.yaml",
      "compose.development.yaml",
      "compose.local.yaml",
      "compose.test.yaml",
      "compose.testing.yaml",
      "compose.ci.yaml",
      "compose.web.yaml",
      "compose.worker.yaml",
      "docker-healthcheck",
      "docker-healthcheck.prod",
      "docker-healthcheck.production",
      "docker-healthcheck.alpha",
      "docker-healthcheck.beta",
      "docker-healthcheck.stage",
      "docker-healthcheck.staging",
      "docker-healthcheck.dev",
      "docker-healthcheck.development",
      "docker-healthcheck.local",
      "docker-healthcheck.test",
      "docker-healthcheck.testing",
      "docker-healthcheck.ci",
      "docker-healthcheck.web",
      "docker-healthcheck.worker",
      "firebase.json",
      ".firebaserc",
      "firestore.rules",
      "firestore.indexes.json",
      ".vscodeignore",
      ".hugo_build.lock",
      "yarn.lock",
      "yarn",
      ".direnv",
      ".env",
      ".env.local",
      ".env.development",
      ".env.dev",
      ".env.production",
      ".env.prod",
      ".env.test",
      "rome.json",
      "biome.json",
      "biome.jsonc",
      "eslint.config.js",
      "eslint.config.ts",
      "eslint.config.cjs",
      "eslint.config.mjs",
      ".eslintrc.js",
      ".eslintrc.cjs",
      ".eslintrc.yaml",
      ".eslintrc.yml",
      ".eslintrc.json",
      ".eslintrc-md.js",
      ".eslintrc-jsdoc.js",
      ".eslintrc",
      ".eslintignore",
      ".eslintcache",
      ".git-blame-ignore",
      ".gitignore",
      ".gitignore-global",
      ".gitignore_global",
      ".gitconfig",
      ".gitattributes",
      ".gitmodules",
      ".gitkeep",
      ".gitinclude",
      "git-history",
      ".swcrc",
      "license",
      "license-agpl",
      "license-apache",
      "license-bsd",
      "license-mit",
      "license-gpl",
      "license-lgpl",
      "license.md",
      "license.rst",
      "license.txt",
      "next.config.js",
      "next.config.mjs",
      "next.config.ts",
      "next.config.mts",
      ".nuxtrc",
      ".nuxtignore",
      "nuxt.config.js",
      "nuxt.config.mjs",
      "nuxt.config.ts",
      "nuxt.config.mts",
      "fresh.config.js",
      "fresh.config.mjs",
      "fresh.config.ts",
      "fresh.config.mts",
      "turbo.json",
      "tailwind.js",
      "tailwind.ts",
      "tailwind.config.js",
      "tailwind.config.cjs",
      "tailwind.config.mjs",
      "tailwind.config.ts",
      "tailwind.config.cts",
      "tailwind.config.mts",
      "tsconfig.json",
      "tsconfig.app.json",
      "tsconfig.editor.json",
      "tsconfig.spec.json",
      "tsconfig.base.json",
      "tsconfig.build.json",
      "tsconfig.eslint.json",
      "tsconfig.lib.json",
      "tsconfig.node.json",
      "tsconfig.e2e.json",
      "tsconfig.web.json",
      "tsconfig.webworker.json",
      "tsconfig.config.json",
      "tsconfig.vitest.json",
      "tsconfig.cjs.json",
      "tsconfig.esm.json",
      "tsconfig.mjs.json",
      "webpack.js",
      "webpack.cjs",
      "webpack.mjs",
      "webpack.ts",
      "webpack.cts",
      "webpack.mts",
      "webpack.base.js",
      "webpack.base.cjs",
      "webpack.base.mjs",
      "webpack.base.ts",
      "webpack.base.cts",
      "webpack.base.mts",
      "webpack.config.js",
      "webpack.config.cjs",
      "webpack.config.mjs",
      "webpack.config.ts",
      "webpack.config.cts",
      "webpack.config.mts",
      "webpack.common.js",
      "webpack.common.cjs",
      "webpack.common.mjs",
      "webpack.common.ts",
      "webpack.common.cts",
      "webpack.common.mts",
      "webpack.config.common.js",
      "webpack.config.common.cjs",
      "webpack.config.common.mjs",
      "webpack.config.common.ts",
      "webpack.config.common.cts",
      "webpack.config.common.mts",
      "webpack.config.common.babel.js",
      "webpack.config.common.babel.ts",
      "webpack.dev.js",
      "webpack.dev.cjs",
      "webpack.dev.mjs",
      "webpack.dev.ts",
      "webpack.dev.cts",
      "webpack.dev.mts",
      "webpack.development.js",
      "webpack.development.cjs",
      "webpack.development.mjs",
      "webpack.development.ts",
      "webpack.development.cts",
      "webpack.development.mts",
      "webpack.config.dev.js",
      "webpack.config.dev.cjs",
      "webpack.config.dev.mjs",
      "webpack.config.dev.ts",
      "webpack.config.dev.cts",
      "webpack.config.dev.mts",
      "webpack.config.dev.babel.js",
      "webpack.config.dev.babel.ts",
      "webpack.mix.js",
      "webpack.mix.cjs",
      "webpack.mix.mjs",
      "webpack.mix.ts",
      "webpack.mix.cts",
      "webpack.mix.mts",
      "webpack.prod.js",
      "webpack.prod.cjs",
      "webpack.prod.mjs",
      "webpack.prod.ts",
      "webpack.prod.cts",
      "webpack.prod.mts",
      "webpack.prod.config.js",
      "webpack.prod.config.cjs",
      "webpack.prod.config.mjs",
      "webpack.prod.config.ts",
      "webpack.prod.config.cts",
      "webpack.prod.config.mts",
      "webpack.production.js",
      "webpack.production.cjs",
      "webpack.production.mjs",
      "webpack.production.ts",
      "webpack.production.cts",
      "webpack.production.mts",
      "webpack.server.js",
      "webpack.server.cjs",
      "webpack.server.mjs",
      "webpack.server.ts",
      "webpack.server.cts",
      "webpack.server.mts",
      "webpack.client.js",
      "webpack.client.cjs",
      "webpack.client.mjs",
      "webpack.client.ts",
      "webpack.client.cts",
      "webpack.client.mts",
      "webpack.config.server.js",
      "webpack.config.server.cjs",
      "webpack.config.server.mjs",
      "webpack.config.server.ts",
      "webpack.config.server.cts",
      "webpack.config.server.mts",
      "webpack.config.client.js",
      "webpack.config.client.cjs",
      "webpack.config.client.mjs",
      "webpack.config.client.ts",
      "webpack.config.client.cts",
      "webpack.config.client.mts",
      "webpack.config.production.babel.js",
      "webpack.config.production.babel.ts",
      "webpack.config.prod.babel.js",
      "webpack.config.prod.babel.cjs",
      "webpack.config.prod.babel.mjs",
      "webpack.config.prod.babel.ts",
      "webpack.config.prod.babel.cts",
      "webpack.config.prod.babel.mts",
      "webpack.config.prod.js",
      "webpack.config.prod.cjs",
      "webpack.config.prod.mjs",
      "webpack.config.prod.ts",
      "webpack.config.prod.cts",
      "webpack.config.prod.mts",
      "webpack.config.production.js",
      "webpack.config.production.cjs",
      "webpack.config.production.mjs",
      "webpack.config.production.ts",
      "webpack.config.production.cts",
      "webpack.config.production.mts",
      "webpack.config.staging.js",
      "webpack.config.staging.cjs",
      "webpack.config.staging.mjs",
      "webpack.config.staging.ts",
      "webpack.config.staging.cts",
      "webpack.config.staging.mts",
      "webpack.config.babel.js",
      "webpack.config.babel.ts",
      "webpack.config.base.babel.js",
      "webpack.config.base.babel.ts",
      "webpack.config.base.js",
      "webpack.config.base.cjs",
      "webpack.config.base.mjs",
      "webpack.config.base.ts",
      "webpack.config.base.cts",
      "webpack.config.base.mts",
      "webpack.config.staging.babel.js",
      "webpack.config.staging.babel.ts",
      "webpack.config.coffee",
      "webpack.config.test.js",
      "webpack.config.test.cjs",
      "webpack.config.test.mjs",
      "webpack.config.test.ts",
      "webpack.config.test.cts",
      "webpack.config.test.mts",
      "webpack.config.vendor.js",
      "webpack.config.vendor.cjs",
      "webpack.config.vendor.mjs",
      "webpack.config.vendor.ts",
      "webpack.config.vendor.cts",
      "webpack.config.vendor.mts",
      "webpack.config.vendor.production.js",
      "webpack.config.vendor.production.cjs",
      "webpack.config.vendor.production.mjs",
      "webpack.config.vendor.production.ts",
      "webpack.config.vendor.production.cts",
      "webpack.config.vendor.production.mts",
      "webpack.test.js",
      "webpack.test.cjs",
      "webpack.test.mjs",
      "webpack.test.ts",
      "webpack.test.cts",
      "webpack.test.mts",
      "webpack.dist.js",
      "webpack.dist.cjs",
      "webpack.dist.mjs",
      "webpack.dist.ts",
      "webpack.dist.cts",
      "webpack.dist.mts",
      "webpackfile.js",
      "webpackfile.cjs",
      "webpackfile.mjs",
      "webpackfile.ts",
      "webpackfile.cts",
      "webpackfile.mts",
      "rsbuild.config.mjs",
      "rsbuild.config.ts",
      "rsbuild.config.js",
      "rsbuild.config.cjs",
      "rsbuild.config.mts",
      "rsbuild.config.cts",
      "rspack.config.js",
      "rspack.config.ts",
      "rspack.config.cjs",
      "rspack.config.mjs",
      "rslib.config.mjs",
      "rslib.config.ts",
      "rslib.config.js",
      "rslib.config.cjs",
      "rslib.config.mts",
      "rslib.config.cts",
      ".oxlintrc.json",
      ".oxlintignore",
      ".nxignore",
      "nx.json",
      "yumma.config.cjs",
      "yumma.config.js",
      "yumma.config.mjs",
      "yumma.config.ts",
      "yumma.css",
      "yummacss.css",
      "components.json",
      "rolldown.config.js",
      "rolldown.config.cjs",
      "rolldown.config.mjs",
      "rolldown.config.ts",
      "rolldown.config.mts",
      "rolldown.config.cts",
      "oxlint.config.js",
      "oxlint.config.cjs",
      "oxlint.config.mjs",
      "oxlint.config.ts",
      "oxlint.config.mts",
      "oxlint.config.cts",
      ".oxfmtrc.json",
      ".oxfmtrc.jsonc",
      "prettier.config.ts",
      "prettier.config.cts",
      "prettier.config.mts",
      ".prettierrc.ts",
      ".prettierrc.cts",
      ".prettierrc.mts",
      "eslint.config.cts",
      "eslint.config.mts",
      "oxfmt.config.js",
      "oxfmt.config.cjs",
      "oxfmt.config.mjs",
      "oxfmt.config.ts",
      "oxfmt.config.mts",
      "oxfmt.config.cts",
    ],
  ],
  [DataIcon, [".mcattributes", ".mcdefinitions", ".mcignore"]],
];

function buildIconMap(groups: Array<[FileIconComponent, string[]]>) {
  const map = new Map<string, FileIconComponent>();
  for (const [Icon, keys] of groups) {
    for (const key of keys) map.set(key, Icon);
  }
  return map;
}

const EXTENSION_ICONS = buildIconMap(EXTENSION_ICON_GROUPS);
const FILE_NAME_ICONS = buildIconMap(FILE_NAME_ICON_GROUPS);

function overrideIcon(overrides: FileIconMap | undefined, key: string) {
  if (!overrides) return undefined;
  if (!Object.prototype.hasOwnProperty.call(overrides, key)) return undefined;
  return overrides[key];
}

function hasExtension(overrides: FileIconMap | undefined, key: string) {
  if (overrideIcon(overrides, key)) return true;
  return EXTENSION_ICONS.has(key);
}

/**
 * 扩展名解析规则：优先最长复合扩展名（a.d.ts -> d.ts、x.env.example -> env.example），
 * 否则取最后一段扩展名。没有扩展名时返回空串。
 */
function resolveExtensionKey(fileName: string, overrides?: FileIconMap) {
  const parts = fileName.toLowerCase().split(".");
  if (parts.length <= 1) return "";
  for (let i = parts.length - 2; i >= 0; i--) {
    const candidate = parts.slice(i).join(".");
    if (hasExtension(overrides, candidate)) return candidate;
  }
  return parts[parts.length - 1] ?? "";
}

/**
 * 按文件名解析图标。autoAssign 命中完整文件名时优先取文件名图标，
 * 其次取扩展名图标，都没有则用通用文件图标。
 */
export function FileIcon({
  fileName,
  autoAssign,
  editFileNameData,
  editFileExtensionData,
  ...props
}: {
  fileName: string;
  autoAssign?: boolean;
  editFileNameData?: FileIconMap;
  editFileExtensionData?: FileIconMap;
} & SVGProps<SVGSVGElement>) {
  const name = fileName.toLowerCase();
  const byFileName = autoAssign
    ? (overrideIcon(editFileNameData, name) ?? FILE_NAME_ICONS.get(name))
    : undefined;
  const extensionKey = resolveExtensionKey(fileName, editFileExtensionData);
  const byExtension =
    overrideIcon(editFileExtensionData, extensionKey) ?? EXTENSION_ICONS.get(extensionKey);
  const Icon = byFileName ?? byExtension ?? DocumentIcon;
  return <Icon {...props} />;
}
