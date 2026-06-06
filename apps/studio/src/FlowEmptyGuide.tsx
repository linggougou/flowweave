type FlowEmptyGuideProps = {
  projectName?: string;
};

/** 项目下尚无 Flow 时的引导说明 */
export function FlowEmptyGuide({ projectName }: FlowEmptyGuideProps) {
  return (
    <section className="flow-empty-guide" aria-labelledby="flow-empty-title">
      <h2 id="flow-empty-title">还没有可查看的流程</h2>
      <p className="flow-empty-lead">
        {projectName ? (
          <>
            项目「<strong>{projectName}</strong>」里还没有任何 Flow。
          </>
        ) : (
          <>当前项目里还没有任何 Flow。</>
        )}
        <br />
        新建项目不会自动生成步骤，需要先用<strong>浏览器扩展</strong>录制网页操作，再同步到知识库。
      </p>
      <ol className="flow-empty-steps">
        <li>
          在仓库根目录运行 <code>pnpm dev:web</code>（知识库 API，默认{" "}
          <code>127.0.0.1:3847</code>）
        </li>
        <li>
          运行 <code>pnpm dev:extension</code>，在 Chrome 加载扩展目录（见{" "}
          <code>apps/extension/README.md</code>）
        </li>
        <li>打开要自动化的网页，在扩展侧栏开始录制并完成操作</li>
        <li>
          在扩展中选择与本 Studio <strong>相同名称</strong>的项目，点击「同步到知识库」
        </li>
        <li>回到此处刷新或重新选中项目，Flow 列表会出现，即可查看步骤并运行</li>
      </ol>
      <p className="flow-empty-note">
        Flow 即一条可回放的自动化流程（打开页面、点击、输入等步骤的集合）。
      </p>
    </section>
  );
}
