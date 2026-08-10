# frozen_string_literal: true

require "json"
require "open3"
require "pathname"

ROOT = Pathname.new(__dir__).parent.freeze
CONFORMANCE = ROOT.join("packages/botchart/conformance").freeze
TRANSCRIPTS = CONFORMANCE.join("transcripts").freeze

WORKER = <<~'JAVASCRIPT'.strip.freeze
  const input = JSON.parse(await Bun.stdin.text());
  const simulator = await import("./packages/botchart/src/simulator.ts");
  if (input.action === "coverage") {
    console.log(JSON.stringify(simulator.verifyCoverage(input)));
  } else {
    const core = await import("./packages/botchart/src/index.ts");
    if (typeof core.step !== "function") throw new Error("Export step from botchart before you process transcripts.");
    const options = { transcript: input.transcript, spec: input.spec, runner: core.step };
    if (input.action === "update") {
      const replay = await simulator.updateTranscript(options);
      if (replay.issues.length > 0) throw new Error(replay.issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n"));
      await Bun.write(Bun.stdout, simulator.stringifyTranscript(replay.transcript));
    } else {
      console.log(JSON.stringify(await simulator.verifyTranscript(options)));
    }
  }
JAVASCRIPT

def run_worker(input)
  stdout, stderr, status = Open3.capture3(
    "bun",
    "--eval",
    WORKER,
    stdin_data: JSON.generate(input),
    chdir: ROOT.to_s
  )
  return stdout if status.success?

  warn stderr.strip
  exit 1
end

def transcript_files
  TRANSCRIPTS.glob("*.json").sort
end

def load_case(path)
  transcript = JSON.parse(path.read)
  spec_path = path.dirname.join(transcript.fetch("spec").fetch("path")).cleanpath
  [transcript, JSON.parse(spec_path.read)]
rescue Errno::ENOENT, JSON::ParserError, KeyError => error
  warn "#{path.relative_path_from(ROOT)}: #{error.message}"
  exit 1
end

def update
  arguments = ARGV.dup
  arguments.shift if arguments.first == "--"
  valid = arguments == ["--all"] || (arguments.length == 1 && arguments.first != "--all")
  unless valid
    warn "Name one scenario or use --all."
    exit 1
  end

  paths = if arguments == ["--all"]
    transcript_files
  else
    name = arguments.fetch(0)
    unless /\A[a-z0-9]+(?:-[a-z0-9]+)*\z/.match?(name)
      warn "Use a lowercase scenario name with hyphens."
      exit 1
    end
    path = TRANSCRIPTS.join("#{name}.json")
    unless path.file?
      warn "Create packages/botchart/conformance/transcripts/#{name}.json first."
      exit 1
    end
    [path]
  end

  paths.each do |path|
    transcript, spec = load_case(path)
    path.write(run_worker(action: "update", transcript:, spec:))
    puts "Updated #{path.relative_path_from(ROOT)}"
  end
end

def verify
  unless ARGV.empty? || ARGV == ["--"]
    warn "Run golden:verify without a scenario name."
    exit 1
  end

  paths = transcript_files
  cases = paths.map { |path| [path, *load_case(path)] }
  failed = false
  cases.each do |path, transcript, spec|
    report = JSON.parse(run_worker(action: "verify", transcript:, spec:))
    next if report.fetch("ok")

    failed = true
    report.fetch("issues").each do |issue|
      warn "#{path.relative_path_from(ROOT)} #{issue.fetch("path")}: #{issue.fetch("message")}"
    end
  end

  manifest = JSON.parse(CONFORMANCE.join("coverage.json").read)
  coverage = JSON.parse(run_worker(
    action: "coverage",
    manifest:,
    transcripts: cases.map { |item| item.fetch(1) }
  ))
  coverage.each do |issue|
    failed = true
    warn "coverage.json #{issue.fetch("path")}: #{issue.fetch("message")}"
  end

  exit 1 if failed
end

action = ARGV.shift
case action
when "update" then update
when "verify" then verify
else
  warn "Use update or verify."
  exit 1
end
