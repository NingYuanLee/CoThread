import fs from "fs";

const path = "web/ProjectCodeConnectors.tsx";
let src = fs.readFileSync(path, "utf8");

src = src.replace(
  /type ConnectorState = \{[\s\S]*?updatedAt: string \| null;\n\};/,
  `type ConnectorKind = "github" | "yunxiao" | "mastergo";
type GitKind = "github" | "yunxiao";

type ConnectorState = {
  kind: ConnectorKind;
  enabled: boolean;
  hasToken: boolean;
  tokenHint: string | null;
  organizationId: string | null;
  updatedAt: string | null;
};`,
);

if (!src.includes("type DesignResource")) {
  src = src.replace(
    /type CodeConfig = \{[\s\S]*?remotes: GitRemote\[\];\n\};/,
    `type DesignResource = {
  id: string;
  platform: "mastergo";
  fileId: string;
  layerId: string;
  label: string;
  resourceUrl: string | null;
};

type CodeConfig = {
  connectors: { github: ConnectorState; yunxiao: ConnectorState; mastergo: ConnectorState };
  remotes: GitRemote[];
  designResources?: DesignResource[];
};`,
  );
}

src = src.replace(
  /const LABELS = \{ github: "GitHub", yunxiao: "云效 Codeup" \} as const;\nconst TAB_ICONS = \{ github: "github", yunxiao: "yunxiao" \} as const;/,
  `const LABELS = { github: "GitHub", yunxiao: "云效 Codeup", mastergo: "MasterGo" } as const;
const TAB_ICONS = { github: "github", yunxiao: "yunxiao", mastergo: "mastergo" } as const;
const TAB_ORDER = ["yunxiao", "github", "mastergo"] as const;`,
);

// Expand draft/reveal/locked state initializers
src = src.replace(
  /useState<Record<string, string>>\(\{ github: "", yunxiao: "" \}\)/g,
  'useState<Record<string, string>>({ github: "", yunxiao: "", mastergo: "" })',
);
src = src.replace(
  /useState<Record<string, boolean>>\(\{ github: false, yunxiao: false \}\)/g,
  'useState<Record<string, boolean>>({ github: false, yunxiao: false, mastergo: false })',
);
src = src.replace(
  /useState<Record<string, boolean>>\(\{ github: true, yunxiao: true \}\)/g,
  'useState<Record<string, boolean>>({ github: true, yunxiao: true, mastergo: true })',
);
src = src.replace(
  /useState<"github" \| "yunxiao">\("yunxiao"\)/,
  'useState<ConnectorKind>("yunxiao")',
);

// Add design draft state after orgDraft
if (!src.includes("designDrafts")) {
  src = src.replace(
    /const \[orgDraft, setOrgDraft\] = useState\(""\);/,
    `const [orgDraft, setOrgDraft] = useState("");
  const [designUrl, setDesignUrl] = useState("");
  const [designDrafts, setDesignDrafts] = useState<DesignResource[]>([]);`,
  );
}

// reload: include mastergo
src = src.replace(
  /setRevealed\(\{ github: false, yunxiao: false \}\);\n    setTokenLocked\(\{ github: true, yunxiao: true \}\);\n    const nextDrafts: Record<string, string> = \{ github: "", yunxiao: "" \};\n    if \(canManage\) \{\n      await Promise\.all\(\(\["github", "yunxiao"\] as const\)\.map\(async \(kind\) => \{/,
  `setRevealed({ github: false, yunxiao: false, mastergo: false });
    setTokenLocked({ github: true, yunxiao: true, mastergo: true });
    setDesignDrafts(next.designResources || []);
    const nextDrafts: Record<string, string> = { github: "", yunxiao: "", mastergo: "" };
    if (canManage) {
      await Promise.all((["github", "yunxiao", "mastergo"] as const).map(async (kind) => {`,
);

// Fix function signatures kind unions for saveConnector etc - replace github | yunxiao with ConnectorKind where appropriate
src = src.replaceAll(
  'kind: "github" | "yunxiao"',
  "kind: ConnectorKind",
);

fs.writeFileSync(path, src);
console.log("ok", path, src.includes("mastergo"), src.includes("DesignResource"));
