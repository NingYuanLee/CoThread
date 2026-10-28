import React, { useEffect, useState } from "react";
import { SelectField } from "./SelectField";
import { TextAreaField } from "./TextAreaField";
import { TextField } from "./TextField";

export function OrgHome({
  api,
}: {
  api: (path: string, data?: unknown, method?: string) => Promise<any>;
}) {
  const [orgs, setOrgs] = useState<{ id: string; name: string; kind: string }[]>([]);
  const [orgId, setOrgId] = useState("");
  const [shelf, setShelf] = useState<any>(null);
  const [catalog, setCatalog] = useState<any>(null);
  const [guideTitle, setGuideTitle] = useState("");
  const [guideBody, setGuideBody] = useState("");
  const [companyTitle, setCompanyTitle] = useState("");
  const [companyBody, setCompanyBody] = useState("");
  const [question, setQuestion] = useState("");
  const [scope, setScope] = useState("org");
  const [turns, setTurns] = useState<any[]>([]);
  const [error, setError] = useState("");

  const loadShelf = async (id: string) => {
    const data = await api("/orgs/" + id + "/shelf");
    setShelf(data);
    const room = await api("/orgs/" + id + "/wiki-questions");
    if (scope === "org") setTurns(room.turns || []);
  };

  useEffect(() => {
    let alive = true;
    Promise.all([api("/orgs/mine"), api("/company/catalog")])
      .then(([mine, company]) => {
        if (!alive) return;
        setOrgs(mine.orgs || []);
        setCatalog(company);
        if (mine.orgs?.[0]) {
          setOrgId(mine.orgs[0].id);
          return loadShelf(mine.orgs[0].id);
        }
      })
      .catch((reason) => {
        if (alive) setError(reason?.message || "组织架没有打开");
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="org-home">
      <p>
        主办项目只显示记忆条目标题。参与项目只有短简报，没有正文。公司目录不自动抄项目记忆。回答不会自动发到群里。
      </p>
      <p>
        <a href="/?stay=workspace">进入工作台</a>
      </p>
      {error && <p role="alert">{error}</p>}
      <SelectField
        allOption={false}
        label="我的组织"
        value={orgId}
        options={orgs.map((org) => ({ value: org.id, label: org.name }))}
        onChange={(value) => {
          setOrgId(value);
          void loadShelf(value);
        }}
      />
      {shelf && (
        <>
          <h3>组织指南</h3>
          <ul>
            {(shelf.guides || []).map((guide: any) => (
              <li key={guide.id}>
                <strong>{guide.title}</strong>
                <p>{guide.body}</p>
              </li>
            ))}
          </ul>
          {shelf.canWrite && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void api(
                  "/orgs/" + orgId + "/guides",
                  { title: guideTitle, body: guideBody },
                  "POST",
                ).then(() => loadShelf(orgId));
              }}
            >
              <TextField
                value={guideTitle}
                onChange={(event) => setGuideTitle(event.target.value)}
                placeholder="组织指南标题"
              />
              <TextAreaField
                value={guideBody}
                onChange={(event) => setGuideBody(event.target.value)}
                placeholder="人工编写，不会从项目页抄来"
              />
              <button type="submit" disabled={!guideTitle.trim()}>
                保存组织指南
              </button>
            </form>
          )}
          <h3>主办项目</h3>
          <p>点项目名直接打开该项目的记忆弹窗。</p>
          <ul>
            {(shelf.projects || []).map((project: any) => (
              <li key={project.id}>
                <a href={`/?projectId=${encodeURIComponent(project.id)}&memory=1&stay=workspace`}>
                  {project.name}
                </a>
                <ul>
                  {project.pages.map((page: any) => (
                    <li key={page.id}>{page.title}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <h3>参与简报</h3>
          <ul>
            {(shelf.briefs || []).map((brief: any) => (
              <li key={brief.id}>
                {brief.projectName}：{brief.brief}
              </li>
            ))}
          </ul>
        </>
      )}
      <h3>公司目录</h3>
      <ul>
        {(catalog?.orgs || []).map((org: any) => (
          <li key={org.id}>{org.name}</li>
        ))}
      </ul>
      <ul>
        {(catalog?.guides || []).map((guide: any) => (
          <li key={guide.id}>
            <strong>{guide.title}</strong>
            <p>{guide.body}</p>
          </li>
        ))}
      </ul>
      {catalog?.canWrite && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void api("/company/guides", { title: companyTitle, body: companyBody }, "POST").then(
              (next) => setCatalog(next),
            );
          }}
        >
          <TextField
            value={companyTitle}
            onChange={(event) => setCompanyTitle(event.target.value)}
            placeholder="公司指南标题"
          />
          <TextAreaField
            value={companyBody}
            onChange={(event) => setCompanyBody(event.target.value)}
          />
          <button type="submit" disabled={!companyTitle.trim()}>
            保存公司指南
          </button>
        </form>
      )}
      <h3>问老翁</h3>
      <SelectField
        allOption={false}
        aria-label="提问范围"
        value={scope}
        options={[
          { value: "org", label: "本组织" },
          { value: "company", label: "全公司" },
        ]}
        onChange={setScope}
      />
      <ul>
        {turns.map((turn) => (
          <li key={turn.id}>
            <p>{turn.body}</p>
            <p>{turn.answer?.body}</p>
          </li>
        ))}
      </ul>
      <TextAreaField
        aria-label="问题"
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
      />
      <button
        type="button"
        disabled={!question.trim()}
        onClick={() => {
          const path =
            scope === "company" ? "/company/wiki-questions" : "/orgs/" + orgId + "/wiki-questions";
          void api(path, { body: question }, "POST")
            .then(() => api(path))
            .then((room) => {
              setTurns(room.turns || []);
              setQuestion("");
            })
            .catch((reason) => setError(reason?.message || "没有问成"));
        }}
      >
        提问
      </button>
    </div>
  );
}
