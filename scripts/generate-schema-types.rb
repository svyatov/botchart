#!/usr/bin/env ruby

require "json"

class TypeGenerator
  def initialize(schema)
    @schema = schema
  end

  def generate
    definitions = @schema.fetch("$defs").map do |name, value|
      "export type #{type_name(name)} = #{render(value)};"
    end

    <<~TYPES
      // Generated from packages/botchart/schema.json by scripts/generate-schema-types.rb.
      // Run the generator after each schema change.

      #{definitions.join("\n\n")}

      export type BotchartSpec = #{render(@schema)};
      export type CanonicalState = StateNode;
      export type ContextJsonSchema = ContextSchema;
    TYPES
  end

  private

  def render(schema)
    return "never" if schema == false
    return "unknown" if schema == true || schema.nil?
    return ref_type(schema.fetch("$ref")) if schema.key?("$ref")
    return JSON.generate(schema.fetch("const")) if schema.key?("const")
    return schema.fetch("enum").map { |value| JSON.generate(value) }.join(" | ") if schema.key?("enum")
    return schema.fetch("oneOf").map { |value| parenthesize(render(value)) }.join(" | ") if schema.key?("oneOf") && !schema.key?("type")

    types = Array(schema["type"])
    return "unknown" if types.empty?
    return types.map { |type| render_type(type, schema) }.join(" | ") if types.length > 1

    render_type(types.first, schema)
  end

  def render_type(type, schema)
    case type
    when "string" then "string"
    when "number", "integer" then "number"
    when "boolean" then "boolean"
    when "null" then "null"
    when "array"
      item = render(schema["items"])
      "readonly #{parenthesize(item)}[]"
    when "object"
      render_object(schema)
    else
      "unknown"
    end
  end

  def render_object(schema)
    properties = schema.fetch("properties", {})
    required = schema.fetch("required", [])
    members = properties.map do |name, value|
      optional = required.include?(name) ? "" : "?"
      "readonly #{property_name(name)}#{optional}: #{render(value)};"
    end

    object = if members.empty?
      "{}"
    else
      "{\n#{members.map { |member| indent(member, 2) }.join("\n")}\n}"
    end

    additional = schema["additionalProperties"]
    return object if additional == false
    return "Readonly<Record<string, unknown>>" if members.empty? && additional.nil?
    return object if additional.nil?

    record = "Readonly<Record<string, #{render(additional)}>>"
    members.empty? ? record : "#{object} & #{record}"
  end

  def ref_type(ref)
    prefix = "#/$defs/"
    raise "Unsupported reference: #{ref}" unless ref.start_with?(prefix)

    type_name(ref.delete_prefix(prefix))
  end

  def type_name(name)
    name.gsub(/(?:\A|_)([a-z0-9])/) { Regexp.last_match(1).upcase }
  end

  def property_name(name)
    name.match?(/\A[$A-Za-z_][$A-Za-z0-9_]*\z/) ? name : JSON.generate(name)
  end

  def parenthesize(type)
    type.include?(" | ") || type.include?(" & ") ? "(#{type})" : type
  end

  def indent(text, width)
    prefix = " " * width
    text.lines.map { |line| "#{prefix}#{line}" }.join.rstrip
  end
end

root = File.expand_path("..", __dir__)
schema_path = ARGV.fetch(0, File.join(root, "packages/botchart/schema.json"))
output_path = ARGV.fetch(1, File.join(root, "packages/botchart/src/spec.generated.ts"))
schema = JSON.parse(File.read(schema_path))
File.write(output_path, TypeGenerator.new(schema).generate)
