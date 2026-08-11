require "net/http"
require "pathname"
require "uri"

root = Pathname(ARGV.fetch(0) do
  abort "The playground output path is missing. Fix: pass the built directory."
end).expand_path

unless root.directory?
  abort "The playground output does not exist at #{root}. Fix: build the playground first."
end

assets = root.glob("**/*", File::FNM_DOTMATCH)
  .select(&:file?)
  .map { |path| path.relative_path_from(root).to_s }
  .sort

if assets.empty?
  abort "The playground output has no assets. Fix: build the playground first."
end

empty_assets = assets.select { |asset| (root / asset).empty? }
unless empty_assets.empty?
  abort "Empty playground assets: #{empty_assets.join(", ")}. Fix: rebuild the playground."
end

base_url = ARGV[1]
unless base_url
  puts "Checked #{assets.length} local playground assets."
  exit
end

base_uri = URI(base_url.end_with?("/") ? base_url : "#{base_url}/")
unless %w[http https].include?(base_uri.scheme) && base_uri.host
  abort "The playground URL must use HTTP or HTTPS. Fix: pass the deployed Pages URL."
end

failures = []
12.times do |attempt|
  failures = assets.filter_map do |asset|
    uri = URI.join(base_uri.to_s, asset)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = uri.scheme == "https"
    http.open_timeout = 10
    http.read_timeout = 30
    response = http.get(uri.request_uri)
    source = (root / asset).binread

    if !response.is_a?(Net::HTTPSuccess)
      "#{asset}: HTTP #{response.code}"
    elsif response.body.b != source
      "#{asset}: deployed bytes differ from the build"
    end
  rescue StandardError => error
    "#{asset}: #{error.class}: #{error.message}"
  end

  break if failures.empty?
  sleep 5 if attempt < 11
end

unless failures.empty?
  abort "Playground smoke check failed:\n#{failures.join("\n")}\nFix: deploy the current playground build."
end

puts "Checked #{assets.length} deployed playground assets at #{base_uri}."
