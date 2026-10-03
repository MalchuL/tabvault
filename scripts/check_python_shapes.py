"""Check Python-owned class fields and function arguments against the seven-item limit."""

import ast
from pathlib import Path

failures: list[str] = []
for root in (Path("server/src"), Path("mcp/src")):
    classes: dict[str, tuple[set[str], list[str]]] = {}
    locations: dict[str, str] = {}
    for path in root.rglob("*.py"):
        for node in ast.walk(ast.parse(path.read_text())):
            location = f"{path}:{getattr(node, 'lineno', 1)}"
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                arguments = [
                    argument
                    for argument in node.args.posonlyargs
                    + node.args.args
                    + node.args.kwonlyargs
                    if argument.arg not in {"self", "cls"}
                ]
                if len(arguments) > 7:
                    failures.append(
                        f"{location}: {node.name} has {len(arguments)} arguments"
                    )
            if not isinstance(node, ast.ClassDef):
                continue
            fields: set[str] = set()
            for member in node.body:
                if isinstance(member, ast.AnnAssign) and isinstance(
                    member.target, ast.Name
                ):
                    if (
                        member.target.id != "model_config"
                        and not member.target.id.startswith("__")
                    ):
                        fields.add(member.target.id)
                if isinstance(member, (ast.FunctionDef, ast.AsyncFunctionDef)):
                    if any(
                        isinstance(decorator, ast.Name) and decorator.id == "property"
                        for decorator in member.decorator_list
                    ):
                        fields.add(member.name)
                    for assignment in ast.walk(member):
                        if isinstance(assignment, (ast.Assign, ast.AnnAssign)):
                            targets = (
                                assignment.targets
                                if isinstance(assignment, ast.Assign)
                                else [assignment.target]
                            )
                            for target in targets:
                                if (
                                    isinstance(target, ast.Attribute)
                                    and isinstance(target.value, ast.Name)
                                    and target.value.id == "self"
                                ):
                                    fields.add(target.attr)
            classes[node.name] = (
                fields,
                [base.id for base in node.bases if isinstance(base, ast.Name)],
            )
            locations[node.name] = location

    def inherited_fields(name: str, seen: frozenset[str] = frozenset()) -> set[str]:
        if name in seen or name not in classes:
            return set()
        fields, bases = classes[name]
        return fields | set().union(
            *(inherited_fields(base, seen | {name}) for base in bases)
        )

    for name in classes:
        count = len(inherited_fields(name))
        if count > 7:
            failures.append(f"{locations[name]}: {name} has {count} fields")
if failures:
    raise SystemExit("\n".join(failures))
print("Python shapes: maximum seven owned fields and arguments.")
