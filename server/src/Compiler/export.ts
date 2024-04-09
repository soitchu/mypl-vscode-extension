import { StringBuffer } from "./StringBuffer";
import { Lexer } from "./Lexer";
import { ASTParser } from "./AST";
import { SemanticChecker } from "./SemanticChecker";
import { join } from "path";

export function parse(code: string, uri: string) {
  const lexer = new Lexer(new StringBuffer(code));
  const ast = new ASTParser(lexer, undefined, false);
  const program = ast.parse();
  const codeGen = new SemanticChecker(true, undefined, join(uri.replace("file:", ""), "../"));
  const wat = codeGen.visit_program(program) as string;
}
