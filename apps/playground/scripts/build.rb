require "fileutils"

app_root = File.expand_path("..", __dir__)
repo_root = File.expand_path("../..", app_root)
dist = File.join(app_root, "dist")
elk_root = File.join(app_root, "node_modules", "elkjs")

unless File.file?(File.join(elk_root, "lib", "elk.bundled.js"))
  abort "elkjs is missing. Run bun install from the repository root, then build again."
end

FileUtils.rm_rf(dist)
FileUtils.mkdir_p(File.join(dist, "vendor"))

unless system("bunx", "tsc", "-p", File.join(app_root, "tsconfig.json"), chdir: repo_root)
  abort "The playground TypeScript build failed. Fix the reported errors, then build again."
end

FileUtils.cp(File.join(app_root, "src", "index.html"), dist)
FileUtils.cp(File.join(app_root, "src", "styles.css"), dist)
FileUtils.cp(File.join(elk_root, "lib", "elk.bundled.js"), File.join(dist, "vendor"))
FileUtils.cp(File.join(elk_root, "LICENSE.md"), File.join(dist, "vendor"))

starter_notices = File.read(File.join(repo_root, "packages", "botchart", "THIRD-PARTY-NOTICES.md"))
starter_notices = starter_notices.sub(/\A# Third-party notices\n+/, "")
File.write(
  File.join(dist, "THIRD-PARTY-NOTICES.md"),
  File.read(File.join(app_root, "THIRD-PARTY-NOTICES.md")) + "\n" + starter_notices,
)

{
  "visual-menu" => "visual-menu",
  "dynamic-list" => "dynamic-list",
}.each do |directory, fixture|
  target = File.join(dist, "starters", directory)
  FileUtils.mkdir_p(target)
  FileUtils.cp(
    File.join(repo_root, "packages", "botchart", "conformance", "specs", "#{fixture}.json"),
    File.join(target, "spec.json"),
  )
  FileUtils.cp(
    File.join(repo_root, "packages", "botchart", "conformance", "transcripts", "#{fixture}.json"),
    File.join(target, "transcript.json"),
  )
  FileUtils.cp(
    File.join(repo_root, "examples", "#{fixture}.preview.json"),
    File.join(target, "preview.json"),
  )
end
