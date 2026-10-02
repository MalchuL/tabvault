/** Check owned TypeScript object fields and function arguments against the seven-item limit. */
import fs from "node:fs";
import process from "node:process";
import path from "node:path";
import ts from "typescript";

function sourceFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory()
      ? sourceFiles(file)
      : /\.tsx?$/.test(file)
        ? [file]
        : [];
  });
}
const files = [...sourceFiles("client/src"), ...sourceFiles("shared")].filter(
  file => !file.endsWith(".test.ts")
);
const config = ts.readConfigFile("tsconfig.json", ts.sys.readFile).config;
const options = ts.convertCompilerOptionsFromJson(
  config.compilerOptions,
  process.cwd()
).options;
const program = ts.createProgram(files, options);
const checker = program.getTypeChecker();
const owned = new Set(files.map(file => path.resolve(file)));
const failures = [];
function report(source, node, count, label) {
  if (count > 7)
    failures.push(
      `${source.fileName}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${label} has ${count} items (maximum 7)`
    );
}
for (const source of program.getSourceFiles()) {
  if (!owned.has(path.resolve(source.fileName))) continue;
  function visit(node) {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      // Native DOM/React attributes belong to the framework, not the project's contracts.
      const fields = checker
        .getPropertiesOfType(checker.getTypeAtLocation(node))
        .filter(field =>
          field.declarations?.some(declaration =>
            owned.has(path.resolve(declaration.getSourceFile().fileName))
          )
        );
      report(source, node, fields.length, node.name.text);
    }
    if (ts.isIntersectionTypeNode(node)) {
      const fields = checker
        .getPropertiesOfType(checker.getTypeAtLocation(node))
        .filter(field =>
          field.declarations?.some(declaration =>
            owned.has(path.resolve(declaration.getSourceFile().fileName))
          )
        );
      report(source, node, fields.length, "Intersection type");
    }
    if (ts.isTypeLiteralNode(node))
      report(source, node, node.members.length, "Object type");
    if (ts.isFunctionLike(node) && node.parameters)
      report(source, node, node.parameters.length, "Function");
    ts.forEachChild(node, visit);
  }
  visit(source);
}
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
} else
  process.stdout.write(
    "TypeScript shapes: maximum seven owned fields and arguments.\n"
  );
