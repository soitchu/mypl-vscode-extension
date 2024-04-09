import { StringBuffer } from "./StringBuffer";
import { Lexer } from "./Lexer";
import { ASTParser } from "./AST";
import { SemanticChecker } from "./SemanticChecker";
import binaryenModule from "binaryen";
import { readFileSync, writeFileSync } from "node:fs";
import { MyWASMError } from "./types";
import { join } from "node:path";
import wabt from "wabt";

interface CompilerOptions {
  O: number | undefined;
  S: number | undefined;
  fastMath: boolean;
  returnBuffer: boolean;
}

// function processError(err: any) {
//   if (err instanceof Error) {
//     const errorObj = err as unknown as MyWASMError;
//     console.error(`${errorObj.type} error: ${errorObj.message}`);
//   } else {
//     console.error("(432) An unexpected error has occurred.");
//   }

//   process.exit(1);
// }

// export async function parse(code: string, uri: string) {
//   try {
//     const lexer = new Lexer(new StringBuffer(code));
//     const ast = new ASTParser(lexer, undefined, false);
//     const program = ast.parse();
//     const codeGen = new SemanticChecker(false, undefined, join(uri, "../"));
//     const wat = codeGen.visit_program(program) as string;
//   } catch (err) {
//     processError(err);
//   }
// }

export async function init(
  input: string,
  output: string,
  options: CompilerOptions
) {
  const lexer = new Lexer(new StringBuffer(readFileSync(input, "utf8")));
  const ast = new ASTParser(lexer);
  const program = ast.parse();
  const codeGen = new SemanticChecker(true, undefined, join(input, "../"));
  const wat = codeGen.visit_program(program) as string;

  const wabtModule = await wabt();
  let wasmModuleBuffer = wabtModule
    .parseWat("", wat, {
      gc: true,
    })
    .toBinary({}).buffer;

  const shouldOptimize = options.O !== undefined && options.O > 0;
  const shouldShrink = options.S !== undefined && options.S > 0;
  const shouldFastMatch = options.fastMath === true;

  if (shouldOptimize || shouldShrink || shouldFastMatch) {
    const wasmModule = binaryenModule.readBinary(wasmModuleBuffer);

    binaryenModule.setFastMath(shouldFastMatch);
    binaryenModule.setOptimizeLevel(options.O ?? 0);
    binaryenModule.setShrinkLevel(options.S ?? 0);

    wasmModule.setFeatures(binaryenModule.Features.BulkMemory);
    wasmModule.optimize();

    wasmModuleBuffer = wasmModule.emitBinary();
  }

  if (options.returnBuffer === true) {
    return wasmModuleBuffer;
  } else {
    writeFileSync(output, wasmModuleBuffer);
  }
}
