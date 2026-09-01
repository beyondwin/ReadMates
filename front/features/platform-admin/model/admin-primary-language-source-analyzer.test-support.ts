import ts from "typescript";

const BANNED_PRIMARY_TERMS = ["Today", "Club registry", "Pipeline", "Ledger", "Job", "Event"] as const;
const RAW_PRIMARY_FIELDS = new Set(["role", "status", "outcome", "refreshState", "stage"]);
const TECHNICAL_DISCLOSURE_NAME = "AdminTechnicalDisclosure";
const TECHNICAL_DISCLOSURE_MODULE = "@/features/platform-admin/ui/admin-technical-disclosure";
const TECHNICAL_DISCLOSURE_CONTRACT_FILE = "__admin-technical-disclosure-contract.d.ts";
const MAX_STATIC_RESOLUTION_DEPTH = 128;

export type AdminPrimaryLanguageViolation = Readonly<{
  line: number;
  reason: string;
}>;

export type AdminPrimaryLanguageAnalysis = Readonly<{
  violations: AdminPrimaryLanguageViolation[];
  technicalDisclosureCount: number;
}>;

export function analyzeAdminPrimaryLanguageSource(
  source: string,
  fileName = "source.tsx",
): AdminPrimaryLanguageAnalysis {
  const { sourceFile, checker } = createSourceContext(source, fileName);
  const technicalDisclosureProvenance = collectTechnicalDisclosureProvenance(sourceFile, checker);
  const violations: AdminPrimaryLanguageViolation[] = [];
  let technicalDisclosureCount = 0;

  const report = (node: ts.Node, reason: string) => {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
    violations.push({ line, reason });
  };

  const inspectStatic = (node: ts.Node) => {
    const inspection = inspectStaticPrimaryCopy(node, checker);
    if (inspection.term) report(node, `primary copy contains ${inspection.term}`);
    else if (inspection.depthExhausted) {
      report(node, "primary copy static resolution depth exhausted");
    }
  };

  const inspectDisclosureCandidateAttributes = (attributes: ts.JsxAttributes) => {
    for (const attribute of attributes.properties) {
      if (ts.isJsxAttribute(attribute)) {
        const initializer = attribute.initializer;
        if (
          initializer
          && ts.isJsxExpression(initializer)
          && initializer.expression
          && isRawPrimaryExpression(initializer.expression, checker)
        ) {
          report(initializer.expression, "raw role/status value rendered in primary UI");
        }
        continue;
      }
      if (isRawPrimaryExpression(attribute.expression, checker)) {
        report(attribute.expression, "raw role/status value rendered in primary UI");
      }
    }
  };

  const visit = (node: ts.Node) => {
    if (ts.isJsxSelfClosingElement(node) || ts.isJsxElement(node)) {
      const opening = ts.isJsxSelfClosingElement(node) ? node : node.openingElement;
      const provenance = classifyTechnicalDisclosureTag(
        opening.tagName,
        checker,
        technicalDisclosureProvenance,
      );
      if (provenance === "canonical") {
        technicalDisclosureCount += 1;
        return;
      }
      if (provenance === "candidate") inspectDisclosureCandidateAttributes(opening.attributes);
    }

    if (ts.isJsxText(node)) inspectStatic(node);
    if (ts.isJsxAttribute(node) && node.initializer) inspectStatic(node.initializer);
    if (ts.isJsxExpression(node) && node.expression) {
      inspectStatic(node.expression);
      if (!ts.isJsxAttribute(node.parent) && isRawPrimaryExpression(node.expression, checker)) {
        report(node.expression, "raw role/status value rendered in primary UI");
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return { violations, technicalDisclosureCount };
}

function createSourceContext(source: string, fileName: string): {
  sourceFile: ts.SourceFile;
  checker: ts.TypeChecker;
} {
  const options: ts.CompilerOptions = {
    jsx: ts.JsxEmit.Preserve,
    noLib: true,
    noResolve: true,
    target: ts.ScriptTarget.Latest,
  };
  const contractSource = `declare module "${TECHNICAL_DISCLOSURE_MODULE}" {
    export function ${TECHNICAL_DISCLOSURE_NAME}(props: unknown): unknown;
  }`;
  const contractFileName = fileName === TECHNICAL_DISCLOSURE_CONTRACT_FILE
    ? "__admin-technical-disclosure-contract-injected.d.ts"
    : TECHNICAL_DISCLOSURE_CONTRACT_FILE;
  const sourceFile = ts.createSourceFile(fileName, source, options.target!, true, ts.ScriptKind.TSX);
  const contractSourceFile = ts.createSourceFile(
    contractFileName,
    contractSource,
    options.target!,
    true,
    ts.ScriptKind.TS,
  );
  const sourceFiles = new Map([
    [fileName, sourceFile],
    [contractFileName, contractSourceFile],
  ]);
  const host = ts.createCompilerHost(options, true);
  host.fileExists = (requestedFileName) => sourceFiles.has(requestedFileName);
  host.readFile = (requestedFileName) => {
    if (requestedFileName === fileName) return source;
    if (requestedFileName === contractFileName) return contractSource;
    return undefined;
  };
  host.getSourceFile = (requestedFileName) => sourceFiles.get(requestedFileName);
  host.writeFile = () => undefined;
  const program = ts.createProgram({
    rootNames: [fileName, contractFileName],
    options,
    host,
  });
  const boundSourceFile = program.getSourceFile(fileName);
  if (!boundSourceFile) throw new Error(`Unable to bind source file: ${fileName}`);
  return { sourceFile: boundSourceFile, checker: program.getTypeChecker() };
}

type TechnicalDisclosureProvenance = Readonly<{
  canonicalExport: ts.Symbol | null;
  canonicalModule: ts.Symbol | null;
  namedImportBindings: ReadonlySet<ts.Symbol>;
  namespaceImportBindings: ReadonlySet<ts.Symbol>;
  candidateNames: ReadonlySet<string>;
}>;

function collectTechnicalDisclosureProvenance(
  sourceFile: ts.SourceFile,
  checker: ts.TypeChecker,
): TechnicalDisclosureProvenance {
  const canonicalModule = checker.getAmbientModules().find(
    (symbol) => symbol.name === `"${TECHNICAL_DISCLOSURE_MODULE}"`,
  ) ?? null;
  const canonicalExport = canonicalModule
    ? checker.getExportsOfModule(canonicalModule).find((symbol) => symbol.name === TECHNICAL_DISCLOSURE_NAME) ?? null
    : null;
  const namedImportBindings = new Set<ts.Symbol>();
  const namespaceImportBindings = new Set<ts.Symbol>();
  const candidateNames = new Set<string>([TECHNICAL_DISCLOSURE_NAME]);
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    if (!ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const namedBindings = statement.importClause?.namedBindings;
    if (!namedBindings) continue;
    if (ts.isNamespaceImport(namedBindings)) {
      if (statement.moduleSpecifier.text !== TECHNICAL_DISCLOSURE_MODULE) continue;
      const binding = checker.getSymbolAtLocation(namedBindings.name);
      if (binding) namespaceImportBindings.add(binding);
      continue;
    }
    for (const element of namedBindings.elements) {
      if ((element.propertyName ?? element.name).text !== TECHNICAL_DISCLOSURE_NAME) continue;
      candidateNames.add(element.name.text);
      if (statement.moduleSpecifier.text !== TECHNICAL_DISCLOSURE_MODULE) continue;
      const binding = checker.getSymbolAtLocation(element.name);
      if (binding) namedImportBindings.add(binding);
    }
  }
  return {
    canonicalExport,
    canonicalModule,
    namedImportBindings,
    namespaceImportBindings,
    candidateNames,
  };
}

function classifyTechnicalDisclosureTag(
  tagName: ts.JsxTagNameExpression,
  checker: ts.TypeChecker,
  provenance: TechnicalDisclosureProvenance,
): "canonical" | "candidate" | "other" {
  if (ts.isIdentifier(tagName)) {
    const binding = checker.getSymbolAtLocation(tagName);
    if (
      binding
      && provenance.namedImportBindings.has(binding)
      && resolveAliasedSymbol(binding, checker) === provenance.canonicalExport
    ) {
      return "canonical";
    }
    return provenance.candidateNames.has(tagName.text) ? "candidate" : "other";
  }
  if (ts.isPropertyAccessExpression(tagName)) {
    const root = leftmostIdentifier(tagName);
    const namespaceBinding = root ? checker.getSymbolAtLocation(root) : undefined;
    const member = checker.getSymbolAtLocation(tagName.name) ?? checker.getSymbolAtLocation(tagName);
    if (
      namespaceBinding
      && provenance.namespaceImportBindings.has(namespaceBinding)
      && resolveAliasedSymbol(namespaceBinding, checker) === provenance.canonicalModule
      && member
      && resolveAliasedSymbol(member, checker) === provenance.canonicalExport
    ) {
      return "canonical";
    }
    return tagName.name.text === TECHNICAL_DISCLOSURE_NAME ? "candidate" : "other";
  }
  return "other";
}

function leftmostIdentifier(node: ts.PropertyAccessExpression): ts.Identifier | null {
  let expression: ts.Expression = node.expression;
  while (ts.isPropertyAccessExpression(expression)) expression = expression.expression;
  return ts.isIdentifier(expression) ? expression : null;
}

function resolveAliasedSymbol(symbol: ts.Symbol, checker: ts.TypeChecker): ts.Symbol {
  let current = symbol;
  const seen = new Set<ts.Symbol>();
  for (let depth = 0; depth < MAX_STATIC_RESOLUTION_DEPTH; depth += 1) {
    if (!(current.flags & ts.SymbolFlags.Alias) || seen.has(current)) return current;
    seen.add(current);
    const resolved = checker.getAliasedSymbol(current);
    if (resolved === current) return current;
    current = resolved;
  }
  return current;
}

type StaticStringResolution = Readonly<{
  exact: string | null;
  fragments: ReadonlySet<string>;
  depthExhausted: boolean;
}>;

function inspectStaticPrimaryCopy(
  node: ts.Node,
  checker: ts.TypeChecker,
): Readonly<{
  term: typeof BANNED_PRIMARY_TERMS[number] | null;
  depthExhausted: boolean;
}> {
  const resolution = resolveStaticString(node, checker);
  return {
    term: BANNED_PRIMARY_TERMS.find(
      (candidate) => [...resolution.fragments].some((fragment) => fragment.includes(candidate)),
    ) ?? null,
    depthExhausted: resolution.depthExhausted,
  };
}

function resolveStaticString(
  node: ts.Node,
  checker: ts.TypeChecker,
  seenBindings = new Set<ts.Symbol>(),
  depth = 0,
): StaticStringResolution {
  if (depth >= MAX_STATIC_RESOLUTION_DEPTH) return emptyStaticStringResolution(true);
  if (ts.isStringLiteralLike(node) || ts.isJsxText(node)) return completeStaticStringResolution(node.text);
  if (ts.isJsxExpression(node)) {
    return node.expression
      ? resolveStaticString(node.expression, checker, seenBindings, depth + 1)
      : completeStaticStringResolution("");
  }
  if (ts.isJsxAttribute(node)) {
    return node.initializer
      ? resolveStaticString(node.initializer, checker, seenBindings, depth + 1)
      : completeStaticStringResolution("");
  }
  if (ts.isIdentifier(node)) {
    const binding = checker.getSymbolAtLocation(node);
    if (!binding || seenBindings.has(binding)) return emptyStaticStringResolution();
    const nextSeen = new Set(seenBindings).add(binding);
    const resolutions = binding.declarations?.flatMap((declaration) => {
      const initializer = staticBindingInitializer(declaration);
      return initializer
        ? [resolveStaticString(initializer, checker, nextSeen, depth + 1)]
        : [];
    }) ?? [];
    return mergeStaticStringResolutions(resolutions);
  }
  if (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)
  ) {
    return resolveStaticString(node.expression, checker, seenBindings, depth + 1);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = resolveStaticString(node.left, checker, new Set(seenBindings), depth + 1);
    const right = resolveStaticString(node.right, checker, new Set(seenBindings), depth + 1);
    const exact = left.exact == null || right.exact == null ? null : left.exact + right.exact;
    return mergeStaticStringFragments(left, right, exact);
  }
  if (ts.isTemplateExpression(node)) {
    let exact: string | null = node.head.text;
    const fragments = new Set<string>([node.head.text]);
    let depthExhausted = false;
    for (const span of node.templateSpans) {
      const expression = resolveStaticString(span.expression, checker, new Set(seenBindings), depth + 1);
      depthExhausted ||= expression.depthExhausted;
      for (const fragment of expression.fragments) fragments.add(fragment);
      fragments.add(span.literal.text);
      exact = exact == null || expression.exact == null
        ? null
        : exact + expression.exact + span.literal.text;
    }
    if (exact != null) fragments.add(exact);
    return { exact, fragments, depthExhausted };
  }
  return emptyStaticStringResolution();
}

function staticBindingInitializer(declaration: ts.Declaration): ts.Expression | null {
  if (
    ts.isVariableDeclaration(declaration)
    || ts.isParameter(declaration)
    || ts.isBindingElement(declaration)
  ) {
    return declaration.initializer ?? null;
  }
  return null;
}

function completeStaticStringResolution(value: string): StaticStringResolution {
  return { exact: value, fragments: new Set([value]), depthExhausted: false };
}

function emptyStaticStringResolution(depthExhausted = false): StaticStringResolution {
  return { exact: null, fragments: new Set(), depthExhausted };
}

function mergeStaticStringResolutions(resolutions: readonly StaticStringResolution[]): StaticStringResolution {
  if (resolutions.length === 0) return emptyStaticStringResolution();
  const fragments = new Set<string>();
  const exactValues = new Set<string>();
  let allExact = true;
  let depthExhausted = false;
  for (const resolution of resolutions) {
    depthExhausted ||= resolution.depthExhausted;
    for (const fragment of resolution.fragments) fragments.add(fragment);
    if (resolution.exact == null) {
      allExact = false;
    } else {
      exactValues.add(resolution.exact);
    }
  }
  const exact = allExact && exactValues.size === 1 ? [...exactValues][0]! : null;
  if (exact != null) fragments.add(exact);
  return { exact, fragments, depthExhausted };
}

function mergeStaticStringFragments(
  left: StaticStringResolution,
  right: StaticStringResolution,
  exact: string | null,
): StaticStringResolution {
  const fragments = new Set([...left.fragments, ...right.fragments]);
  if (exact != null) fragments.add(exact);
  return {
    exact,
    fragments,
    depthExhausted: left.depthExhausted || right.depthExhausted,
  };
}

function isRawPrimaryExpression(
  node: ts.Expression,
  checker: ts.TypeChecker,
  seenBindings = new Set<ts.Symbol>(),
): boolean {
  if (ts.isIdentifier(node)) {
    const binding = checker.getSymbolAtLocation(node);
    if (!binding || seenBindings.has(binding)) return false;
    const nextSeen = new Set(seenBindings).add(binding);
    return binding.declarations?.some((declaration) => isRawBindingDeclaration(declaration, checker, nextSeen)) ?? false;
  }
  if (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isNonNullExpression(node)
    || ts.isSatisfiesExpression(node)
  ) {
    return isRawPrimaryExpression(node.expression, checker, seenBindings);
  }
  if (ts.isPropertyAccessExpression(node)) return RAW_PRIMARY_FIELDS.has(node.name.text);
  if (ts.isElementAccessExpression(node) && node.argumentExpression && ts.isStringLiteral(node.argumentExpression)) {
    return RAW_PRIMARY_FIELDS.has(node.argumentExpression.text);
  }
  if (ts.isConditionalExpression(node)) {
    return isRawPrimaryExpression(node.whenTrue, checker, seenBindings)
      || isRawPrimaryExpression(node.whenFalse, checker, seenBindings);
  }
  if (ts.isBinaryExpression(node)) {
    return isRawPrimaryExpression(node.left, checker, seenBindings)
      || isRawPrimaryExpression(node.right, checker, seenBindings);
  }
  if (ts.isTemplateExpression(node)) {
    return node.templateSpans.some((span) => isRawPrimaryExpression(span.expression, checker, seenBindings));
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.some((element) => {
      if (ts.isOmittedExpression(element)) return false;
      if (ts.isSpreadElement(element)) return isRawPrimaryExpression(element.expression, checker, seenBindings);
      return isRawPrimaryExpression(element, checker, seenBindings);
    });
  }
  if (ts.isObjectLiteralExpression(node)) {
    return node.properties.some((property) => {
      if (ts.isPropertyAssignment(property)) {
        return isRawPrimaryExpression(property.initializer, checker, seenBindings);
      }
      if (ts.isShorthandPropertyAssignment(property)) {
        return isRawPrimaryExpression(property.name, checker, seenBindings)
          || Boolean(property.objectAssignmentInitializer
            && isRawPrimaryExpression(property.objectAssignmentInitializer, checker, seenBindings));
      }
      if (ts.isSpreadAssignment(property)) {
        return isRawPrimaryExpression(property.expression, checker, seenBindings);
      }
      return false;
    });
  }
  if (ts.isCallExpression(node)) {
    if (ts.isIdentifier(node.expression) && node.expression.text === "String") {
      return node.arguments.some((argument) => isRawPrimaryExpression(argument, checker, seenBindings));
    }
    if (
      ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === "toString"
      && node.arguments.length === 0
    ) {
      return isRawPrimaryExpression(node.expression.expression, checker, seenBindings);
    }
  }
  return false;
}

function isRawBindingDeclaration(
  declaration: ts.Declaration,
  checker: ts.TypeChecker,
  seenBindings: ReadonlySet<ts.Symbol>,
): boolean {
  if (ts.isBindingElement(declaration)) {
    const propertyName = declaration.propertyName ?? declaration.name;
    if (
      (ts.isIdentifier(propertyName) || ts.isStringLiteralLike(propertyName))
      && RAW_PRIMARY_FIELDS.has(propertyName.text)
    ) {
      return true;
    }
    return Boolean(
      declaration.initializer
      && isRawPrimaryExpression(declaration.initializer, checker, new Set(seenBindings)),
    );
  }
  if (ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) {
    return Boolean(
      declaration.initializer
      && isRawPrimaryExpression(declaration.initializer, checker, new Set(seenBindings)),
    );
  }
  return false;
}
