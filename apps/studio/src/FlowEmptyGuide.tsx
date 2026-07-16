type FlowEmptyGuideProps = {
  projectName?: string;
};

/** 项目下尚无 Flow 时的引导说明 */
export function FlowEmptyGuide({ projectName }: FlowEmptyGuideProps) {
  return (
    <section className="flow-empty-guide" aria-labelledby="flow-empty-title">
      <h2 id="flow-empty-title">录制第一个自动化任务</h2>
      <p className="flow-empty-lead">
        {projectName ? (
          <>
            项目「<strong>{projectName}</strong>」里还没有自动化任务。
          </>
        ) : (
          <>当前项目里还没有自动化任务。</>
        )}
        <br />
        使用<strong>FlowWeave 浏览器扩展</strong>记录一次网页操作，保存后即可在这里运行。
      </p>
      <ol className="flow-empty-steps">
        <li>
          保持织流 Studio 打开，并确认 FlowWeave 浏览器扩展已启用
        </li>
        <li>
          打开要自动化的网页，在浏览器工具栏打开 FlowWeave
        </li>
        <li>确认当前页面已就绪，然后完成需要重复执行的操作</li>
        <li>
          在扩展中选择项目「<strong>{projectName ?? "当前项目"}</strong>」，点击「保存到 Studio」
        </li>
        <li>回到 Studio 查看新任务；若未自动出现，可点击项目旁的刷新按钮</li>
      </ol>
      <p className="flow-empty-note">
        保存前请确认录制内容不包含不需要重复执行的操作。
      </p>
    </section>
  );
}
