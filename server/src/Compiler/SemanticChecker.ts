import path from "node:path";
import { Visitor } from "./Printer";
import { SymbolTable } from "./SymbolTable";
import * as ast from "./types";
import * as WASM from "./WasmHelper";
import fs from "node:fs";
import { Lexer } from "./Lexer";
import { ASTParser } from "./AST";
import { StringBuffer } from "./StringBuffer";
import { EOL } from "node:os";

const STRICT_MODE = true;
const UNSTRICT_MODE = false;
const BASE_TYPES = ['int', 'double', 'bool', 'string'];
const BOOLEAN_OPS = ["!=", "==", ">", ">=", "<", "<=", "or", "and"];
const DONT_COPY_STRINGS_FOR = [
    'delete_string',
    'get_array_pointer',
    'string_to_array_int',
    'get'
];

const SUPPORTED_BINARY_OPS = {
    "array": ["==", "!="]
};

SUPPORTED_BINARY_OPS[ast.TokenType.INT_TYPE] = ["!=", "==", ">", ">=", "<", "<=", "-", "/", "+", "*", "%"];
SUPPORTED_BINARY_OPS[ast.TokenType.BOOL_TYPE] = ["and", "or", "!=", "=="];
SUPPORTED_BINARY_OPS[ast.TokenType.STRING_TYPE] = ["+", "==", "!=", "<", "<=", ">", ">="];
SUPPORTED_BINARY_OPS[ast.TokenType.NULL_VAL] = ["==", "!="];
SUPPORTED_BINARY_OPS[ast.TokenType.ID] = ["==", "!="];
SUPPORTED_BINARY_OPS[ast.TokenType.DOUBLE_TYPE] = SUPPORTED_BINARY_OPS[ast.TokenType.INT_TYPE]
SUPPORTED_BINARY_OPS[ast.TokenType.DOUBLE_VAL] = SUPPORTED_BINARY_OPS[ast.TokenType.INT_TYPE]
SUPPORTED_BINARY_OPS[ast.TokenType.INT_VAL] = SUPPORTED_BINARY_OPS[ast.TokenType.INT_TYPE]
SUPPORTED_BINARY_OPS[ast.TokenType.BOOL_VAL] = SUPPORTED_BINARY_OPS[ast.TokenType.BOOL_TYPE]
SUPPORTED_BINARY_OPS[ast.TokenType.STRING_VAL] = SUPPORTED_BINARY_OPS[ast.TokenType.STRING_TYPE]
SUPPORTED_BINARY_OPS[ast.TokenType.VOID_TYPE] = SUPPORTED_BINARY_OPS[ast.TokenType.NULL_VAL]




function decimal_to_little_endian_hex(decimal_value: number){
    // # Convert decimal to hex
    let hex_value = decimal_value.toString(16);

    // Ensure the hex value has an even length
    if(hex_value.length % 2 != 0){
        hex_value = "0" + hex_value;
    }

    // Split the hex value into little-endian bytes
    // little_endian_bytes = [hex_value[i:i+2] for i in range(0, len(hex_value), 2)]

    const little_endian_bytes:Array<string> = [];
    for (let i = 0; i < hex_value.length; i += 2) {
        little_endian_bytes.push(hex_value.slice(i, i + 2));
    }

    // # Reverse the order of the bytes
    little_endian_bytes.reverse();

    // # Join the bytes to create the little-endian hex value
    let little_endian_hex  = little_endian_bytes.join("");
    little_endian_hex = little_endian_hex.padEnd(8, "0")
    
    let hex_string = ""
                
    for(let i = 0; i < 8; i += 2){
        hex_string += "\\" + little_endian_hex[i] + little_endian_hex[i + 1]
    }
        
    return hex_string;
}

function print(str: string) {
    // process.stdout.write(str);
    console.log(str);
}

export class SemanticChecker extends Visitor{
    indent = 0;
    buffer = "";
    main_output = "";
    should_output = true;
    GLOBAL_NAMESPACE = "main";
    global_offset = 8;
    dir_path: string = "";
    is_entry_file: boolean = true;
    string_was_concated: boolean;
    structs: {[key: string]: ast.StructDef} = {};
    current_return_type: ast.DataType | undefined
    functions: {[key: string]: ast.FunDef} = {}
    namespaces: string[] = []
    data_section = ""
    string_map: {[key: string]: number} = {};
    declared_variables: ast.VarDef[] = []
    loop_count = 0
    symbol_table = new SymbolTable()
    curr_type: ast.DataType | undefined;
    core_functions = "";
    overloaded_functions = {
        "print": {
            "0": [
                WASM.DATA_TYPES["int"], 
                WASM.DATA_TYPES["double"], 
                WASM.DATA_TYPES["bool"], 
                WASM.DATA_TYPES["string"]
            ]
        },
        "length": {
            "0": [
                WASM.DATA_TYPES["ANY_ARRAY"],
                WASM.DATA_TYPES["string"]
            ]
        },
        "get_array_pointer": {
            "0": [
                WASM.DATA_TYPES["ANY_ARRAY"],
                WASM.DATA_TYPES["string"]
            ]
        },
        "delete_struct": {
            "0": [
                WASM.DATA_TYPES["ANY_STRUCT"]
            ]
        }
    }

    constructor(is_entry_file = true, namespace: string | undefined = undefined, dir_path: string = "") {
        super();

        if(namespace !== undefined){
            this.GLOBAL_NAMESPACE = namespace
        }

        this.dir_path = dir_path
        this.is_entry_file = is_entry_file
        this.string_was_concated = false
        this.functions = {
            "print": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "print", 0, 0),
                [
                    new ast.VarDef(
                       WASM.DATA_TYPES["string"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "sleep": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "sleep", 0, 0),
                [
                    new ast.VarDef(
                       WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "random": new ast.FunDef(
                WASM.DATA_TYPES["double"],
                ast.Token(ast.TokenType.ID, "random", 0, 0),
                [],
                []
            ),
            "error": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "error", 0, 0),
                [
                    new ast.VarDef(
                       WASM.DATA_TYPES["string"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "input": new ast.FunDef(
                WASM.DATA_TYPES["string"],
                ast.Token(ast.TokenType.ID, "input", 0, 0),
                [],
                []
            ),
            "itos": new ast.FunDef(
                WASM.DATA_TYPES["string"],
                ast.Token(ast.TokenType.ID, "itos", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "itod": new ast.FunDef(
                WASM.DATA_TYPES["double"],
                ast.Token(ast.TokenType.ID, "itod", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "dtos": new ast.FunDef(
                WASM.DATA_TYPES["string"],
                ast.Token(ast.TokenType.ID, "dtos", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["double"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "dtoi": new ast.FunDef(
                WASM.DATA_TYPES["int"],
                ast.Token(ast.TokenType.ID, "dtoi", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["double"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "stoi": new ast.FunDef(
                WASM.DATA_TYPES["int"],
                ast.Token(ast.TokenType.ID, "stoi", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["string"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "stod": new ast.FunDef(
                WASM.DATA_TYPES["double"],
                ast.Token(ast.TokenType.ID, "stod", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["string"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "length": new ast.FunDef(
                WASM.DATA_TYPES["int"],
                ast.Token(ast.TokenType.ID, "length", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["string"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "get": new ast.FunDef(
                WASM.DATA_TYPES["string"],
                ast.Token(ast.TokenType.ID, "get", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    ),
                    new ast.VarDef(
                        WASM.DATA_TYPES["string"],
                        ast.Token(ast.TokenType.ID, "value_", 0, 0)
                    )
                ],
                []
            ),
            "allocate_memory": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "allocate_memory", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "deallocate_memory": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "deallocate_memory", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "arr", 0, 0)
                    ),
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "length", 0, 0)
                    )
                ],
                []
            ),
            "delete_i32_array": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "delete_i32_array", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["array_int"],
                        ast.Token(ast.TokenType.ID, "arr", 0, 0)
                    )
                ],
                []
            ),
            "delete_string": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "delete_string", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["string"],
                        ast.Token(ast.TokenType.ID, "str_ptr", 0, 0)
                    )
                ],
                []
            ),
             "delete_struct": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "delete_struct", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "struct_ptr", 0, 0)
                    )
                ],
                []
            ),
            "mem_copy": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "mem_copy", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "dest", 0, 0)
                    ),
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "source", 0, 0)
                    ),
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "num_bits", 0, 0)
                    )
                ],
                []
            ),
            "i32_store": new ast.FunDef(
                WASM.DATA_TYPES["void"],
                ast.Token(ast.TokenType.ID, "i32_store", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "position", 0, 0)
                    ),
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "value", 0, 0)
                    )
                ],
                []
            ),
            "i32_load": new ast.FunDef(
                WASM.DATA_TYPES["int"],
                ast.Token(ast.TokenType.ID, "i32_load", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["int"],
                        ast.Token(ast.TokenType.ID, "position", 0, 0)
                    )
                ],
                []
            ),
            "get_array_pointer": new ast.FunDef(
                WASM.DATA_TYPES["int"],
                ast.Token(ast.TokenType.ID, "get_array_pointer", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["ANY_ARRAY"],
                        ast.Token(ast.TokenType.ID, "arr", 0, 0)
                    )
                ],
                []
            ),
            "array_int_to_string": new ast.FunDef(
                WASM.DATA_TYPES["string"],
                ast.Token(ast.TokenType.ID, "array_int_to_string", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["array_int"],
                        ast.Token(ast.TokenType.ID, "str", 0, 0)
                    )
                ],
                []
            ),
            "string_to_array_int": new ast.FunDef(
                WASM.DATA_TYPES["array_int"],
                ast.Token(ast.TokenType.ID, "string_to_array_int", 0, 0),
                [
                    new ast.VarDef(
                        WASM.DATA_TYPES["string"],
                        ast.Token(ast.TokenType.ID, "str", 0, 0)
                    )
                ],
                []
            ),
          }
          
    }
        
    // Helper Functions
    
    output(msg: string | undefined){
        if(msg !== undefined && this.should_output){
            // # print("output", msg)
            this.buffer += msg;
        }
    }
        
    output_with_indent(msg: string){
        if(this.should_output){
            this.output_indent()
            this.output(msg)
        }
    }
        
    output_in_new_line(msg: string){
        if(this.should_output){
            this.output(EOL);
            this.output_indent()
            this.output(msg)
        }
    }

        
    output_indent(){
        if(this.should_output){
            this.buffer += '  '.repeat(this.indent);
        }
    }

    flush(){
        this.main_output += this.buffer
        this.buffer = ""
    }

    discard(){
        const tmpBuffer = this.buffer;
        this.buffer = "";
        return tmpBuffer;
    }

    error(msg: string, token: ast.Token | undefined): never {
        if(token === undefined){
            throw Error(msg);
        }

        const semanticError = new Error(msg) as ast.MyWASMError;
        const line = token.line;
        const column = token.column;

        semanticError.line = line;
        semanticError.column = column;
        semanticError.type = "Semantic";

        throw semanticError;
    }

    match_type(expected: ast.DataType, actual: ast.DataType, strict_mode = true){
        /**
            checks where expected ast.DataType is equal to actual Datatype
            
            When strict_mode is false, any type is equal to void AND vice versa 
        */
        
        const expected_token_type = expected.type_name.lexeme
        const actual_token_type = actual.type_name.lexeme
        
        return  (
                    (
                        expected.is_array == actual.is_array &&
                        expected_token_type == actual_token_type
                    ) 
                    ||
                    (
                        (
                            // # This basically ensures that "null" can go 
                            // # into any type, but also makes sure that
                            // # a non-null data type can't be assigned to void 
                            actual_token_type == "void"
                            ||
                            (strict_mode == false && expected_token_type == "void")
                        )
                    )
                )

    }

    match_any_type(expectedTypes: ast.DataType[], actual: ast.DataType){
        /** 
            Matches any of the types in expectedTypes against actual ast.DataType
            Return true if the actual ast.DataType matches atleast one of the ast.DataTypes
            in expectedTypes.
            
            Mainly used for native overloaded functions
        */
        
        for(const expected of expectedTypes){
            // Any type of arrays are fine when the data type is ANY_ARRAY
            if (
                expected == WASM.DATA_TYPES["ANY_ARRAY"]
                && 
                actual.is_array == true
            ){
                return true
            }
            
            if (
                actual.type_name.lexeme in this.structs &&
                actual.is_array == false &&
                expected == WASM.DATA_TYPES["ANY_STRUCT"]
            ){
                return true
            }

            // If it isn't ANY_ARRAY, then actually compare it
            if(this.match_type(expected, actual)){
                return true
            }
        }

        return false
    }
    
    is_boolean(t: ast.DataType | undefined){
        /**
            Checks whether a ast.DataType is a boolean; returns true if it is.
        */
       
        if(t === undefined){
            return false
        }
        
        return  (
                    [
                        ast.TokenType.BOOL_TYPE, 
                        ast.TokenType.BOOL_VAL
                    ].includes(t.type_name.token_type)
                    &&
                    t.is_array == false
                )   
    }

    get_field_type(struct_def: ast.StructDef, field_name: string){
        /**
            Returns the ast.DataType for the given field name of the struct
            definition.

            Args:
                struct_def: The ast.StructDef object 
                field_name: The name of the field

            Returns: The corresponding ast.DataType or undefined if the field name
            is not in the struct_def.
        */
        
        for(const var_def of struct_def.fields) {
            if(var_def.var_name.lexeme == field_name) {                    
                return var_def.data_type;
            }
        }
        
        return undefined;
    }

    get_field_cummulative_size(struct_def: ast.StructDef, field_name: string){
        let total_size = 0
        
        for(const var_def of struct_def.fields){
            
            if(var_def.var_name.lexeme === field_name){
                return total_size
            }

            total_size += WASM.getWASMSize(var_def.data_type)
        }
            
        return 0;
    }
    
    get_struct_total_size(struct_def: ast.StructDef){
        let total_size = 0
        
        for(const var_def of struct_def.fields){
            total_size += WASM.getWASMSize(var_def.data_type);
        }
        
        return total_size
    }

    type_to_string(data_type: ast.DataType){
        /**
            Converts a ast.DataType to string
        */
        
        let output = data_type.type_name.lexeme
        
        if(data_type.is_array){
            output = "array " + output
        }
        
        return output;
    }
    
    get_first_rvalue_token(expr: ast.Expr){
        /**
            Returns the first Token dataclass from an Expr.
            Mainly used for passing a Token to this.error
        */
        
        const first: ast.SimpleTerm | ast.ComplexTerm = expr.first as (ast.SimpleTerm | ast.ComplexTerm);
        
        if(first instanceof ast.SimpleTerm){
            const rvalue = first.rvalue
            
            if (rvalue instanceof ast.CallExpr){
                return rvalue.fun_name
            }
            else if (rvalue instanceof ast.NewRValue){
                return rvalue.type_name;
            }
            else if (rvalue instanceof ast.VarRValue){
                return rvalue.path[0].var_name
            }
            else if (rvalue instanceof ast.SimpleRValue){
                return rvalue.value
            }
            else{
                this.error("(0) Unexpected rvalue", undefined)
            }
        }
        else{
            return this.get_first_rvalue_token(first.expr)
        }
    }
    
    get_curr_token(error_code: number, error_token: ast.Token): never | ast.DataType {
        /**
            Since this.curr_token can be undefined, this method makes sure 
            that it isn't and returns it.
            
            If it is, then an error is thrown and the message is constructed 
            using error_code and error_token
        */
        
        if(this.curr_type === undefined){
            this.error(`(${error_code}) Unexpected error. curr_type was undefined`, error_token)
        }

        return this.curr_type
    }
    
    is_symbol_a_var(name: string){
        return !(name in this.functions || name in this.structs);
    }
    
    is_valid_namespace(namespace: ast.Token){
        // # if namespace.lexeme not in this.namespaces or namespace.lexeme == "main":
        //     # this.error(f'"{namespace.lexeme}" is not a valid namespace' ,namespace)
        // pass
    }
        
    // Visitor Functions
    visit_delete_stmt(delete_stmt: ast.DeleteStmt){
        delete_stmt.var_rvalue.accept(this);

        const var_type = this.get_curr_token(62, delete_stmt.var_rvalue.path[0].var_name)
        const token_type = var_type.type_name.token_type;
        
        if(token_type === ast.TokenType.ID){
            // # TODO make sure the struct exists
            this.output_in_new_line("call $delete_struct")
        }
        else if(var_type.is_array){
            if ([ast.TokenType.DOUBLE_TYPE, ast.TokenType.DOUBLE_VAL].includes(token_type)){
                this.error(`(64) Cannot delete f64 arrays yet`, delete_stmt.var_rvalue.path[0].var_name)
            }
            else{
                this.output_in_new_line("call $delete_i32_array")
            }
        }
        else if ([ast.TokenType.STRING_TYPE, ast.TokenType.STRING_VAL].includes(token_type)){
                this.output_in_new_line("call $delete_string")
        }
        else{
            this.error(`(63) Cannot delete ${var_type.type_name.lexeme}`, delete_stmt.var_rvalue.path[0].var_name);
        }
    }        
    
    visit_program(program: ast.Program) {
        /**
            Entry visiting point 
        */
        
        // check and record struct defs
        this.core_functions = "";

        if(this.is_entry_file){
            this.core_functions += "(module"
            this.indent += 1
            
            this.core_functions += '(import "env" "memory" (memory $0 1))'
            this.core_functions += WASM.getWASMCoreFunctions()

            this.symbol_table.add("offset", WASM.DATA_TYPES["int"])
            this.symbol_table.add("mem", WASM.DATA_TYPES["array_int"])
        }

        for(const struct of program.struct_defs){
            const struct_name = struct.struct_name.lexeme;
            
            if(struct_name in this.structs){
                this.error(`(1) Duplicate ${struct_name} definition`, struct.struct_name);
            }

            this.structs[struct_name] = struct;
            
            for(const var_def of struct.fields){
                if(var_def.data_type.namespace != undefined){
                    var_def.data_type.type_name.lexeme = var_def.data_type.namespace.lexeme + "_" + var_def.data_type.type_name.lexeme

                    // TODO this seems janky
                    var_def.data_type.namespace = undefined
                }
            }
        }
            
        // check and record function defs
        for(const fun of program.fun_defs){
            const fun_name = fun.fun_name.lexeme
            
            if(fun_name in this.functions){ 
                this.error(`(2) Duplicate function "${fun_name}"'s definition`, fun.fun_name)
            }


            // # TODO uncomment
            // # if fun_name in WASM.BUILT_INS:
            // #     this.error(f"(3) Redefining built-in function", fun.fun_name)
            // # if fun_name == 'main' and fun.return_type.type_name.lexeme != 'void':
            // #     this.error("(4) \"main\" must have the return type as void", fun.return_type.type_name)
            // # if fun_name == 'main' and fun.params: 
            // #     this.error("(5) \"main\" function should not have parameters", fun.fun_name)
            this.functions[fun_name] = fun
            
            // Export functions only when they are in the main file
            if(this.is_entry_file && fun.shouldExport){
                let name = fun.fun_name.lexeme;

                if(fun.return_type.namespace !== undefined){
                    name = fun.return_type.namespace.lexeme + "_" + name
                }

                this.core_functions += `(export "${fun.original_name}" (func $${name}))${EOL}`
            }
            
            if(fun.return_type.namespace !== undefined){
                fun.return_type.type_name.lexeme = fun.return_type.namespace.lexeme + "_" + fun.return_type.type_name.lexeme
                fun.return_type.namespace = undefined
            }
            
        }

        // # check main function
        // # TODO: revisit this
        // # if "main" not in this.functions:
        // #     this.error("(6) \"main\" function not found", undefined)
            
        this.symbol_table.push_environment()
               
        
        for(const imp of program.imports){
            let new_namespace = imp.namespace;

            if(this.GLOBAL_NAMESPACE !== undefined && this.GLOBAL_NAMESPACE != ""){
                new_namespace = this.GLOBAL_NAMESPACE + "_" + new_namespace
                // # print(new_namespace)
            }
                
            // console.log(this.dir_path);
            // # print(this.file_path)
            // # print(imp)
            
            const in_stream = new StringBuffer(
                fs.readFileSync(path.join(this.dir_path, imp.file_name), "utf-8")
            )    

            // TODO check if this works
            const lexer = new Lexer(in_stream)
            const parser = new ASTParser(lexer, new_namespace)
            const ast = parser.parse()
            const visitor = new SemanticChecker(false, new_namespace, path.join(this.dir_path as string, imp.file_name, "../"))
            ast.accept(visitor)

            // console.log(visitor.functions);

            
            this.global_offset += visitor.global_offset - 8
            this.data_section += visitor.data_section
            
            for(const lexeme in visitor.string_map){
                this.string_map[lexeme] = visitor.string_map[lexeme]
            }
            
            // # TODO check for duplicates
            program.vdecl_stmts.push(...ast.vdecl_stmts)
            // # this.output_in_new_line(visitor.main_output)
            
            // # for struct in visitor.structs:
            // #     if struct in this.structs:
            // #         this.error(f"(61) Duplicate struct \"{struct}\" found", visitor.structs[struct].struct_name)
                
            // #     this.structs[struct] = visitor.structs[struct]
                
            for(const struct in visitor.structs){
                if(struct in this.structs){
                    this.error(`(60) Duplicate struct "${struct}" found`, visitor.structs[struct].struct_name)
                }

                this.structs[struct] = visitor.structs[struct]
            }
            
            
            for(const func_name in visitor.functions){
                if(WASM.BUILT_INS.includes(func_name)){
                    continue
                }
                else{
                    if(func_name in this.functions){
                        this.error(`(59) Duplicate function "${func_name}" found`, this.functions[func_name].fun_name)
                    }

                    this.functions[func_name] = visitor.functions[func_name]
                }
            }
            
            // # TODO test for duplicate namespaces
            this.namespaces.push(imp.namespace)
        } 
        
        for(const stmt of program.vdecl_stmts){
            this.flush()
            this.visit_var_decl(stmt)
            
            // # Discarding to make sure it doesn't print
            this.discard()
            
            // # Handling the special case of global variables
            const data_type = stmt.var_def.data_type
            const wasm_type = WASM.getWASMType(data_type.type_name, data_type.is_array)
            const var_name = stmt.var_def.var_name.lexeme
            
            // # This is always defined since that's how the parser was 
            // # programmed
            if(stmt.expr === undefined){
                this.error("(54) Global variable's expr was undefined", stmt.var_def.var_name)
            }

            const var_value = ((stmt.expr.first as ast.SimpleTerm).rvalue as ast.SimpleRValue).value
            
            this.core_functions += `(global \$${var_name} (mut ${wasm_type}) (${wasm_type}.const ${WASM.getWASMValue(var_value)}))`
        }

        this.output(EOL + EOL)
            
        // # check each struct
        for(const struct in this.structs){
            this.structs[struct].accept(this);
        }
        
        // # check each function
        for(const fun in this.functions){
            this.functions[fun].accept(this)
        }
            
        this.indent -= 1
        
        if(this.is_entry_file){
            this.output_with_indent(")")
        }
            
        this.symbol_table.pop_environment()
        
        if(!(this.symbol_table.length == 0)){ 
            this.error(
                "(7) Unexpected error. Was expecting environment to have length 0", 
                undefined
            )
        }
        
        this.flush()
        
        this.data_section += `(data (i32.const 4) \"${decimal_to_little_endian_hex(this.global_offset)}\")`
        
        // # this.output_in_new_line(this.data_section)
        // # print(this.data_section)
                
        if(this.is_entry_file){
            this.core_functions += this.data_section

            return this.core_functions + this.main_output;
        }
    }
        
        
        
    visit_struct_def(struct_def: ast.StructDef){
        const fieldNames = new Set<string>()
        
        if(struct_def.struct_name.lexeme in this.namespaces){
            this.error("(57) struct's name can't be the same as a namespace", struct_def.struct_name)
        }

        this.symbol_table.add(
            struct_def.struct_name.lexeme, 
            new ast.DataType(
                false,
                struct_def.struct_name,
                undefined
            )
        )
        
        for(const field of struct_def.fields){
            let type_name = field.data_type.type_name.lexeme
            
            if(field.data_type.namespace !== undefined){
                type_name =  field.data_type.namespace.lexeme + "_" + type_name 
            }
            
            if(fieldNames.has(field.var_name.lexeme)){
                this.error(
                    `(8) Duplicate field name "${field.var_name.lexeme}" in struct "${struct_def.struct_name.lexeme}"`, 
                    field.var_name
                )
            }
            
            fieldNames.add(field.var_name.lexeme)
            
            if(!BASE_TYPES.includes(type_name) && !(type_name in this.structs)){
                this.error(`(9) Type "${type_name}" not found`, field.data_type.type_name)
            }
        }
    }

    visit_fun_def(fun_def: ast.FunDef){
        if(WASM.BUILT_INS.includes(fun_def.fun_name.lexeme)){
            return
        }
        
        this.flush()
        
        this.loop_count = 0
        this.declared_variables = []
        const param_names = new Set<string>()
        const stmt_buffers: string[] = [];
        
        this.symbol_table.push_environment()
        this.current_return_type = fun_def.return_type
        
        if(this.namespaces.includes(fun_def.fun_name.lexeme)){
            this.error("(58) function name conflicts with a namespace", fun_def.fun_name)
        }
        
        this.symbol_table.add(
            fun_def.fun_name.lexeme, 
            fun_def.return_type
        )
        
        this.curr_type = undefined
        fun_def.return_type.accept(this)
        
        const expected_return_type = this.curr_type
        
        if(expected_return_type === undefined){
            this.error(`(10) Unexpected error. return_type was undefined`, fun_def.return_type.type_name)
        }

        this.output_with_indent("(func $" + fun_def.fun_name.lexeme)
        
        for(const param of fun_def.params){
            param_names.add(param.var_name.lexeme)
            param.accept(this)
        }
        
        this.indent += 1
        
        for(const stmt of fun_def.stmts){  
            this.flush()     
            stmt.accept(this)
            stmt_buffers.push(this.discard())
        }
            
        this.indent -= 1
            
        const func_return_type = fun_def.return_type.type_name
        let did_print_return = func_return_type.token_type == ast.TokenType.VOID_TYPE

        for(const variable of this.declared_variables){
            const symbol = variable.var_name.lexeme
            const data_type = variable.data_type
            
            if(this.is_symbol_a_var(symbol)){
                let type_of_var = "local"
                
                if(param_names.has(symbol)){
                    type_of_var = "param"
                }
                    
                if(symbol in this.symbol_table.environments[0]){
                    type_of_var = "global"
                }
                
                if(type_of_var === "local"){
                    if(!did_print_return){
                        this.output(` (result ${WASM.getWASMType(func_return_type, fun_def.return_type.is_array)})`)
                        did_print_return = true
                    }

                    this.output(EOL)
                }
                
                const type_name = data_type.type_name
                const string_to_print = ` (${type_of_var} \$${symbol} ${WASM.getWASMType(type_name, data_type.is_array)})`;
                
                if(type_of_var === "local"){
                    this.output_with_indent(string_to_print)
                }
                else{
                    this.output(string_to_print)
                }
            }
        }

        if(!did_print_return){
            this.output(` (result ${WASM.getWASMType(func_return_type, fun_def.return_type.is_array)})`)
        }

        for(const stmt of stmt_buffers){
            this.output(EOL)
            this.output(stmt)
        }
        
        this.current_return_type = undefined
        this.symbol_table.pop_environment()
        
        this.indent+=1
        this.output_in_new_line(`${WASM.getWASMType(func_return_type, fun_def.return_type.is_array)}.const 0`)
        this.output_in_new_line("return")
        this.indent-=1
        
        this.output(EOL)
        this.output_with_indent(")")
        this.output(EOL + EOL)
        this.flush()
    }
        
    visit_return_stmt(return_stmt: ast.ReturnStmt){
        this.curr_type = undefined

        this.visit_expr(return_stmt.expr, undefined, false)
                
        this.output(EOL)
        this.output_with_indent("return")
        
        const expr_type = this.get_curr_token(40, this.get_first_rvalue_token(return_stmt.expr))
        
        if(this.current_return_type === undefined){
            this.error("(50) Unexpected error: current_return_type was undefined", this.get_first_rvalue_token(return_stmt.expr))
        }

        if(!this.match_type(this.current_return_type, expr_type)){
            this.error(`(11) Return expression's type (\"${this.type_to_string(expr_type)}\") does not match function's return type (\"${this.type_to_string(this.current_return_type)}\")`, this.get_first_rvalue_token(return_stmt.expr)) 
        }   
    }  

    visit_var_decl(var_decl: ast.VarDecl){
        let value_type: ast.DataType | undefined = undefined;
                    
        if(var_decl.expr !== undefined){
            this.curr_type = undefined;
            this.string_was_concated = false
            
            var_decl.expr.accept(this)
            
            const var_name = var_decl.var_def.var_name.lexeme
            
            let type_of_var = "local"
            
            if(var_name in this.symbol_table.environments[0]){
                type_of_var = "global"
            }
            
            
            const term = var_decl.expr.first
            value_type = this.curr_type as unknown as ast.DataType;
                
            // # If it's only referencing a single string variable, then copy the string
            // # if (
            // #     var_decl.expr.op is undefined and 
            // #     isinstance(term, ast.SimpleTerm) and 
            // #     isinstance(term.rvalue, ast.VarRValue) and 
            // #     value_type.is_array == false and 
            // #     value_type.type_name.token_type in [ast.TokenType.STRING_TYPE, ast.TokenType.STRING_VAL]
            // # ):
            // #     this.output_in_new_line(f"call $copy_string")
                
            this.output_in_new_line(`${type_of_var}.set \$${var_name}`)
        } 
        
        this.curr_type = undefined
        var_decl.var_def.accept(this)
        const var_type = this.get_curr_token(41, var_decl.var_def.var_name)
        
        if (value_type !== undefined && !this.match_type(var_type, value_type)){             
            this.error(`(12) Type mismatch. Tried assigning \"${this.type_to_string(value_type)}\" to \"${this.type_to_string(var_type)}\"`, var_decl.var_def.var_name)
        }       
}
        
        
    visit_assign_stmt(assign_stmt: ast.AssignStmt){
        // # this.should_output = false
        // # this.output_in_new_line("===")
        // # this.visit_var_rvalue(assign_stmt)
        // # this.output_in_new_line("===")
        // # this.should_output = true
        
        this.curr_type = undefined
        assign_stmt.expr.accept(this)
        const r_type = this.get_curr_token(43, this.get_first_rvalue_token(assign_stmt.expr))
        
        // # if r_type.is_array == false and r_type.type_name.token_type == ast.TokenType.STRING_TYPE:
        // # this.output_in_new_line("=")
        
        this.curr_type = undefined
        this.visit_var_rvalue(assign_stmt)
        const l_type = this.get_curr_token(42, assign_stmt.lvalue[0].var_name)
        
        if(!this.match_type(l_type, r_type)){
            this.error(`(13) Tried assigning \"${this.type_to_string(r_type)}\" to \"${this.type_to_string(l_type)}\"`, assign_stmt.lvalue[0].var_name)        
        }
    }

    visit_while_stmt(while_stmt: ast.WhileStmt){
        this.symbol_table.push_environment()
        
        this.loop_count += 1
        const current_loop_count = this.loop_count
        this.output_in_new_line(`(loop \$loop${current_loop_count}`)
        this.indent += 1

        this.curr_type = undefined
        while_stmt.condition.accept(this)
        this.output_in_new_line("if")
        this.indent += 1
        
        const curr_type = this.get_curr_token(44, this.get_first_rvalue_token(while_stmt.condition))
        
        if(!this.is_boolean(curr_type)){
            this.error(`(14) while's condition must be a boolean expression/value, but got \"${this.type_to_string(curr_type)}\"`, this.get_first_rvalue_token(while_stmt.condition))
        }

        for(const stmt of while_stmt.stmts){
            stmt.accept(this)
        }
            
        this.output_in_new_line(`br \$loop${current_loop_count}`)
        
        this.indent -= 1
        this.output_in_new_line("end")
        this.indent -= 1
        this.output_in_new_line(")")

        this.symbol_table.pop_environment()
    }

        
    visit_for_stmt(for_stmt: ast.ForStmt){
        this.symbol_table.push_environment()

        for_stmt.var_decl.accept(this)
        
        this.loop_count += 1
        const current_loop_count = this.loop_count
        this.output_in_new_line(`(loop \$loop${current_loop_count}`)
        this.indent += 1
        
        for(const stmt of for_stmt.stmts){
            stmt.accept(this)
        }
            
        for_stmt.assign_stmt.accept(this)
        
        this.curr_type = undefined
        for_stmt.condition.accept(this)
        const curr_type = this.get_curr_token(45, this.get_first_rvalue_token(for_stmt.condition))

        if(!this.is_boolean(curr_type)){
            this.error(`(15) for's condition must be a boolean expression/value, but got \"${this.type_to_string(curr_type)}\"`, this.get_first_rvalue_token(for_stmt.condition))
        }

        this.output_in_new_line(`br_if $loop${current_loop_count}`)
        this.indent -= 1
        this.output_in_new_line(")")
        this.symbol_table.pop_environment()
    }
    
    visit_if_stmt(if_stmt: ast.IfStmt){
        const basic_ifs: ast.BasicIf[] = []
        basic_ifs.push(if_stmt.if_part);
        basic_ifs.push(...if_stmt.else_ifs);

        const has_else = if_stmt.else_stmts.length !== 0
        const if_part = if_stmt.if_part
        let start_indent = this.indent

        for(const basic_if of basic_ifs){
            this.symbol_table.push_environment()

            this.curr_type = undefined
            
            if(basic_if != if_part){
                this.output_in_new_line("else")
                this.indent += 1
            }
            
            basic_if.condition.accept(this)
                
            const curr_type = this.get_curr_token(46, this.get_first_rvalue_token(basic_if.condition))

            this.output_in_new_line("if")

            // # if basic_if != if_part:
            // #     this.indent -= 1

            this.indent += 1
        
            if(!this.is_boolean(curr_type)){
                this.error(`(16) if's condition must be a boolean expression/value, but got \"${this.type_to_string(curr_type)}\"`, this.get_first_rvalue_token(basic_if.condition))
            }

            for(const stmt of basic_if.stmts){
                stmt.accept(this)
            }

            this.indent -= 1
            this.symbol_table.pop_environment()
            
        }

        this.symbol_table.push_environment()
        
        if(has_else){
            this.output_in_new_line("else")
            this.indent += 1
        }
            
        for(const stmt of if_stmt.else_stmts){
            stmt.accept(this);
        }
            
        if(has_else){
            this.indent -= 1
        }

        this.output_in_new_line("end")
        
        
        while(this.indent > start_indent){
            this.indent -= 1
            this.output_in_new_line("end")
        } 
        
        this.symbol_table.pop_environment()
    }
        
    visit_call_expr(call_expr: ast.CallExpr){  
        if(call_expr.namespace !== undefined){
            this.is_valid_namespace(call_expr.namespace)
            call_expr.fun_name.lexeme = call_expr.namespace.lexeme + "_" + call_expr.fun_name.lexeme
            call_expr.namespace = undefined
        }
              
        if(!(call_expr.fun_name.lexeme in this.functions)){
            this.error(`(17) function \"${call_expr.fun_name.lexeme}\" not found`, call_expr.fun_name)
        }

        const func_info = this.functions[call_expr.fun_name.lexeme]
        const should_copy_string = !(call_expr.fun_name.lexeme in DONT_COPY_STRINGS_FOR)
                
        if(call_expr.args.length !== func_info.params.length){
            this.error(`(18) The call expression must have the same number of arguments as \"${func_info.fun_name.lexeme}\"`, call_expr.fun_name)
        }

        let curr_type: ast.DataType | undefined = undefined;

        for(let i = 0; i < call_expr.args.length; i++){
            const arg = call_expr.args[i]
            
            this.curr_type = undefined
            this.visit_expr(arg, undefined, should_copy_string)
            
            // # arg.accept(self)
            curr_type = this.get_curr_token(47, this.get_first_rvalue_token(arg))

            const func_name = func_info.fun_name.lexeme
            
            if(func_name in this.overloaded_functions){
                if(!this.match_any_type(this.overloaded_functions[func_name][i.toString()], curr_type)){
                    // # TODO make the error message better
                    this.error(`(19) Call expression's arguments' types must match that of the function \"${func_name}\"`, this.get_first_rvalue_token(arg))
                }
            }
                    
            else{
                if(!this.match_type(func_info.params[i].data_type, curr_type)){
                    // # TODO handle 1st 2nd 3rd 11th 12th 13th
                    this.error(
                        `(20) function "${func_name}"\'s ${i + 1}th argument has the type "${this.type_to_string(func_info.params[i].data_type)}", but got "${this.type_to_string(curr_type)}"`,
                        call_expr.fun_name
                    )
                }
            }
        }
        
        const function_to_call = func_info.fun_name.lexeme
        
        if(WASM.getMappedFunctions(function_to_call) === undefined){
            if(function_to_call === "print") {
                this.output_in_new_line(`call \$${WASM.getPrintFunction(curr_type as ast.DataType)}`)
            }
            else if(function_to_call === "length"){
                this.output_in_new_line(`call \$${WASM.getLengthFunction(curr_type as ast.DataType)}`)
            }
            else{ 
                this.output_in_new_line(`call \$${function_to_call}`)
            }
        }
        else{
            this.output_in_new_line(`${WASM.getMappedFunctions(function_to_call)}`)
        }

        this.curr_type = func_info.return_type
    }


    visit_expr(expr: ast.Expr, last_op: undefined | ast.Token = undefined, copy_string = true){
        // # print(expr)
        this.curr_type = undefined;
        let op: string | undefined = undefined;

        const was_bool_op_used = (expr.op !== undefined && BOOLEAN_OPS.includes(expr.op.lexeme))
        const is_boolean_expr = was_bool_op_used || expr.not_op
        
        expr.first.accept(this)
        const first_type = this.curr_type as ast.DataType | undefined;
            
        if(first_type !== undefined){
            if (
                [ast.TokenType.STRING_TYPE, ast.TokenType.STRING_VAL].includes(first_type.type_name.token_type) &&
                (expr.first instanceof ast.SimpleTerm) &&
                (expr.first.rvalue instanceof ast.VarRValue) && 
                !((expr.op !== undefined && expr.op.token_type == ast.TokenType.EQUAL) ||
                 (last_op !== undefined && last_op.token_type == ast.TokenType.EQUAL)
                )  &&
                copy_string
            ){
                this.output_in_new_line("call $copy_string")
                // # this.output_in_new_line(str(expr))
            }
            else{
                // pass
                // # this.output_in_new_line(str(expr))
            }
        }
                
        
        if(expr.op !== undefined){
            op = expr.op.lexeme
        }
        
        if(is_boolean_expr && expr === undefined){
            this.error("(21) Unxpected error: rest can't be undefined for boolean expressions", undefined)
        }

        if(expr.rest !== undefined) {         
            this.visit_expr(expr.rest, expr.op)
            
            const rest_type = this.curr_type
            
            if(first_type === undefined || rest_type === undefined){
                this.error("(22) Unexpected error. first_type or rest_type was undefined.", this.get_first_rvalue_token(expr))
            }
                        
            if(!this.match_type(first_type, rest_type, UNSTRICT_MODE)){
                this.error(
                    `(23) Operations can only be performed on same types, but got "${this.type_to_string(first_type)}" and "${this.type_to_string(rest_type)}"`, expr.op
                )
            }
            
        
            if(first_type.is_array && !SUPPORTED_BINARY_OPS["array"].includes(op as string)){
                this.error(`(54) Can\'t use operator "${op}" on arrays`, expr.op)
            }
            
            if ((!first_type.is_array) && (!SUPPORTED_BINARY_OPS[first_type.type_name.token_type].includes(op))){
                this.error(`(24) Can\'t use operator "${op}" on "${first_type.type_name.lexeme}"s`, expr.op)
            }

            if(BOOLEAN_OPS.includes(op as string)){
                //  # TODO make the line and column right 
                this.curr_type = new ast.DataType(
                    false,
                    ast.Token(
                        ast.TokenType.BOOL_TYPE,
                        "bool",
                        0,
                        0
                    ),
                    undefined
                )
            }
        }

        if(last_op !== undefined && first_type !== undefined){
            if (
                [ast.TokenType.STRING_TYPE, ast.TokenType.STRING_VAL].includes(first_type.type_name.token_type)
                && ((expr.op !== undefined && expr.op.token_type == ast.TokenType.PLUS) ||
                 (last_op !== undefined && last_op.token_type == ast.TokenType.PLUS)
                )
            ){
                this.output_in_new_line("call $string_concat")
                this.string_was_concated = true
            }
            else{
                this.output_in_new_line(`${WASM.getWASMType(first_type.type_name, first_type.is_array)}${WASM.getWASMOp(last_op, first_type.type_name)}`)
            }
        }

        if(expr.not_op){
            // TODO make this a xor
            this.output_in_new_line("i32.const -1")
            this.output_in_new_line("i32.mul")
            this.output_in_new_line("i32.const 1")
            this.output_in_new_line("i32.add")
        }
            
        
        if(is_boolean_expr){ 
            if(!this.is_boolean(this.curr_type)){
                let reason = ""
                
                if(was_bool_op_used){
                    reason = `the boolean operator "${expr.op?.lexeme}" was used.`
                }
                else{
                    reason = '"not" was used';
                }
                    
                this.error(
                    `(25) Was expecting a boolean value, since ${reason}`, 
                    this.get_first_rvalue_token(expr)
                )
            }
        }
    }
        
    visit_data_type(data_type: ast.DataType) {
        // # No need to undefined out curr_type since it's guaranteed to be
        // # not undefined
        
        // # note: allowing void (bad cases of void caught by parser)        
        if(data_type.namespace !== undefined){
            data_type.type_name.lexeme = data_type.namespace.lexeme + "_" + data_type.type_name.lexeme
        }

        const name = data_type.type_name.lexeme;
        
        if(name == "void" || BASE_TYPES.includes(name) || name in this.structs){
            this.curr_type = data_type
        }
        else{ 
            // # print(data_type.type_name.lexeme)
            this.error(`(26) Could not find a struct named "${name}"`, data_type.type_name)
        }
    }

    visit_var_def(var_def: ast.VarDef){
        var_def.data_type.accept(this)
        
        const name = var_def.var_name.lexeme
        
        // # TODO optimize this
        if(
            this.symbol_table.exists_in_curr_env(name)
            || name in this.functions || name in this.structs
        ){
            let reason = ""
            
            if(this.symbol_table.exists_in_curr_env(name)){
                reason = " in the same scope"
            }
            else if(name in this.functions){
                reason = `, since a function with the name "${name}" already exists`
            }
            else if(name in this.structs){
                reason = `, since a struct with the name "${name}" already exists`
            }
                
        
            this.error(`(27) Duplicate variable named \"${name}\" found${reason}`, var_def.var_name)
        }
        else{
            this.symbol_table.add(name, var_def.data_type)
            this.declared_variables.push(var_def)
        }
            
        this.curr_type = var_def.data_type
    }
                            
    visit_simple_term(simple_term: ast.SimpleTerm){
        simple_term.rvalue.accept(this)
    }
        
    
    visit_complex_term(complex_term: ast.ComplexTerm){
        complex_term.expr.accept(this);
    }
        

    visit_simple_rvalue(simple_rvalue: ast.SimpleRValue){
        const value = simple_rvalue.value
        const line = simple_rvalue.value.line
        const column = simple_rvalue.value.column
        let type_token: ast.Token | undefined = undefined;

        if(value.token_type == ast.TokenType.STRING_VAL){
            
            if(!(value.lexeme in this.string_map)){
                const string_length = value.lexeme.length;
                
                this.string_map[value.lexeme] = this.global_offset + 4
                this.data_section += `(data (i32.const ${this.global_offset}) \"`;
                
                
                const length_hex = decimal_to_little_endian_hex(string_length)
                
                    
                
                this.global_offset += 4
                this.data_section += `${length_hex}`
                
                // # this.output_in_new_line(f"i32.const {string_length}")
                // # this.output_in_new_line(f"call $string_ini")
                
                let index = 0
                for(const char of value.lexeme){
                    // # print(char)
                    // # this.output_in_new_line(f"i32.const {index}")
                    // # this.output_in_new_line(f"i32.const {ord(char)}")
                    // # this.output_in_new_line(f"call $string_ini_assign")
                    
                    // # bin_string = bin(ord(char))[2:].zfill(8)
                    
                    // # TODO make sure it is 1 byte
                    // # if char == "\\":
                    // #     # char = "\\\\"
                    // #     this.data_section += decimal_to_little_endian_hex(ord(char))
                    // #     index += 1
                    // #     this.global_offset += 4
                        
                    this.data_section += decimal_to_little_endian_hex(char.charCodeAt(0))
                    
                    // # for i in range(0, 8, 1):
                    //     # new_bin_string += "\\" + bin_string[i]
                        
                    // # this.output(new_bin_string)
                    
                    index += 1
                    this.global_offset += 4
                }

                this.data_section += "\")" + EOL
            }

            this.output_in_new_line(`i32.const ${this.string_map[value.lexeme]}`)
            this.output_in_new_line(`call $copy_string`)
            
        }   
        else{
            this.output_in_new_line(`${WASM.getWASMType(value, false)}.const ${WASM.getWASMValue(value)}`)
        }

        if(value.token_type === ast.TokenType.INT_VAL){
            type_token = ast.Token(ast.TokenType.INT_TYPE, 'int', line, column)
        }
        else if(value.token_type === ast.TokenType.DOUBLE_VAL){
            type_token = ast.Token(ast.TokenType.DOUBLE_TYPE, 'double', line, column)
        }
        else if(value.token_type === ast.TokenType.STRING_VAL){
            type_token = ast.Token(ast.TokenType.STRING_TYPE, 'string', line, column)
        }
        else if(value.token_type === ast.TokenType.BOOL_VAL){
            type_token = ast.Token(ast.TokenType.BOOL_TYPE, 'bool', line, column)
        }
        else if(value.token_type === ast.TokenType.NULL_VAL){
            type_token = ast.Token(ast.TokenType.VOID_TYPE, 'void', line, column)
        }

        if(type_token === undefined){
            this.error("(39) Unexpected error. type_token was undefined", simple_rvalue.value)
        }

        this.curr_type = new ast.DataType(false, type_token, undefined)

    }

    visit_new_rvalue(new_rvalue: ast.NewRValue) {
        
        if(BASE_TYPES.includes(new_rvalue.type_name.lexeme)){
            // # Must be an array
            this.curr_type = new ast.DataType(true, new_rvalue.type_name, undefined)    
        }        
        else {        
            // # Must be referencing a struct
            let struct_name = new_rvalue.type_name.lexeme
            
            if(new_rvalue.namespace !== undefined){
                this.is_valid_namespace(new_rvalue.namespace)
                struct_name = new_rvalue.namespace.lexeme + "_" + struct_name
            }
              
            const struct_type = this.symbol_table.get(struct_name)
            
            if(struct_type === undefined){
                this.error(`(28) struct "${struct_name}" not found`, new_rvalue.type_name)
            }

            if(new_rvalue.struct_params !== undefined){
                const params = new_rvalue.struct_params
                const struct_def = this.structs[struct_type.type_name.lexeme]
                const struct_fields = struct_def.fields
                
                if(struct_fields.length !== params.length){
                    this.error(
                        `(29) A struct's instances must have the same number of arguments as its definition.`, 
                        new_rvalue.type_name
                    )
                }
                
                this.output_in_new_line(`i32.const ${this.get_struct_total_size(struct_def)}`)
                this.output_in_new_line("call $allocate_struct")
                this.output_in_new_line("global.set $tmp")
                
                for(let i = 0; i < params.length; i++){
                    const param = params[i]
                    
                    this.curr_type = undefined
                    param.accept(this)
                    const curr_type = this.get_curr_token(48, this.get_first_rvalue_token(param))
                    
                    if(!this.match_type(struct_fields[i].data_type, curr_type)){
                        // # TODO 1th :p
                        this.error(
                            `(30) struct "${struct_name}"\'s ${i + 1}th argument has the type "${this.type_to_string(struct_fields[i].data_type)}", but got "${this.type_to_string(curr_type)}"`,
                            this.get_first_rvalue_token(param)
                        )
                    }

                    const size = WASM.getWASMSize(struct_fields[i].data_type)

                    this.output_in_new_line("global.get $tmp")
                    this.output_in_new_line(`i32.const ${this.get_field_cummulative_size(struct_def, struct_fields[i].var_name.lexeme)}`)
                    this.output_in_new_line(`call \$${WASM.getWASMType(curr_type.type_name, curr_type.is_array)}_assign_to_struct`)
                
                }

                this.output_in_new_line("global.get $tmp")

                this.curr_type = struct_type
            }
            else {
                this.curr_type = new ast.DataType(
                    true,
                    struct_type.type_name,
                    undefined
                )
            }
        }

        const orig_type = this.curr_type
              
        if(orig_type.is_array){
            if(new_rvalue.array_expr === undefined){
                this.error("(51) Unexpected error. array_expr was none", new_rvalue.type_name)
            }

            new_rvalue.array_expr.accept(this)
            this.output_in_new_line(`call \$${WASM.getWASMType(orig_type.type_name, false)}_new_array`)
            
            const curr_type = this.get_curr_token(52, new_rvalue.type_name)
            
            if(curr_type.type_name.lexeme !== "int"){
                this.error(`(53) Array expression must evaluate to a number, but got \"${curr_type.type_name.lexeme}\"`, new_rvalue.type_name)
            }
            
        }
            
        this.curr_type = orig_type    
    } 
            
    visit_var_rvalue(var_rvalue: ast.VarRValue | ast.AssignStmt){
        let last_type: ast.DataType | undefined = undefined;
        let curr_type: ast.DataType | undefined = undefined;
        let array_type: ast.DataType | undefined = undefined;
        let should_store = true;
        let path_array: ast.VarRef[] = [];
        let was_struct = false;
        let name: ast.Token | undefined;

        if(var_rvalue instanceof ast.VarRValue){
            path_array = var_rvalue.path
            should_store = false
        }
        else{
            path_array = var_rvalue.lvalue
        }    
        

        for(const path of path_array){
            name = path.var_name
            let did_curr_change = false
            
            // # Means this is the first node in the path
            // # which also means that it is a variable
            if(last_type === undefined){
                curr_type = this.symbol_table.get(name.lexeme)
                did_curr_change = true
                array_type = curr_type
                
                if(curr_type === undefined){
                    this.error(`(31) Variable "${name.lexeme}" not found`, name)
                }

                if(path.array_expr === undefined){
                    if(should_store && path == path_array[path_array.length - 1]){
                        // # if curr_type.is_array == false and curr_type.type_name.token_type == ast.TokenType.STRING_TYPE:
                        // #     this.output_in_new_line("===")
                        // #     pass
                        this.output_in_new_line(`${this.symbol_table.get_var_prefix(name.lexeme)}.set \$${name.lexeme}`)
                    }
                    else{                
                        this.output_in_new_line(`${this.symbol_table.get_var_prefix(name.lexeme)}.get \$${name.lexeme}`)
                    }
                }
            }

            if(curr_type === undefined){
                this.error("(32) Unexpected error. curr_type was undefined", name)
            }
            
            was_struct = false
            
            if(last_type !== undefined && last_type.type_name.lexeme in this.structs && !last_type.is_array){
                // # Must be a struct
                
                if (!(last_type.type_name.lexeme in this.structs)){
                    this.error(`(33) Struct "${last_type.type_name.lexeme}" not found`, name)
                }

                curr_type = this.get_field_type(
                    this.structs[last_type.type_name.lexeme],
                    name.lexeme
                )
                
                if(curr_type === undefined){
                    this.error("(55) Unexpected error. curr_type was undefined.", name)
                }

                array_type = curr_type
                
                this.output_in_new_line("call $check_if_null")
                let offset = this.get_field_cummulative_size(this.structs[last_type.type_name.lexeme], name.lexeme)
                this.output_in_new_line(`i32.const ${offset}`)
                
                if(should_store && path == path_array.at(-1) && path.array_expr === undefined) {
                    this.output_in_new_line(`call \$${WASM.getWASMType(array_type.type_name, array_type.is_array)}_assign_to_struct`)
                }
                else{
                    this.output_in_new_line("i32.add")
                    this.output_in_new_line(`${WASM.getWASMType(array_type.type_name, array_type.is_array)}.load`)
                }
                
                if(curr_type === undefined) {
                    this.error(`(34) Struct "${last_type.type_name.lexeme}" does not have a field named "${name.lexeme}"`, name)
                }

                did_curr_change = true
                was_struct = true
            
            }

            if(path.array_expr !== undefined){                
                // # Must be an array
                if(curr_type.is_array){
                    this.curr_type = undefined
                    path.array_expr.accept(this)
                    const original_type = curr_type.type_name
                    curr_type = this.get_curr_token(49, curr_type.type_name)

                    if(!was_struct){
                        if(name.lexeme in this.symbol_table.environments[0]){
                            this.output_in_new_line(`global.get \$${name.lexeme}"`)
                        }
                        else{
                            this.output_in_new_line(`local.get \$${name.lexeme}`)
                        }
                    }

                    if(array_type === undefined){
                        this.error("(56) Unexpected error. array_type was undefined.", name)
                    }

                    let function_to_call = "";

                    if(should_store && path == path_array.at(-1)){
                        function_to_call = `${WASM.getWASMType(array_type.type_name, false)}_set_array_elem`
                    }
                    else{
                        function_to_call = `${WASM.getWASMType(array_type.type_name, false)}_get_array_elem`
                    }
                    
                    if(was_struct){
                        function_to_call += "_alt"
                    }
                        
                    this.output_in_new_line(`call \$${function_to_call}`)
                    
                                      
                    if(curr_type.type_name.lexeme !== "int"){
                        this.error(`(35) Array index must be an integer, but found type ${this.type_to_string(curr_type)}`, name) 
                    }

                    // # is_array is false since we don't support 2D arrays
                    curr_type = new ast.DataType(
                        false,
                        original_type,
                        undefined
                    )
                }
                else{
                    this.error("(36) Can't access an element of a non-array", name)
                }
                
                did_curr_change = true
            }

            // # last_type is guaranteed to be not undefined when
            // # did_curr_change is true. This is basically to
            // # make our type checking overlords happy
            if(!did_curr_change && last_type !== undefined){
                this.error(`(37) Cannot read "${name.lexeme}" from "${this.type_to_string(curr_type)}"`, name)                
            }

            last_type = curr_type
        
        }

        if(last_type === undefined){
            this.error("(38) Unexpected error. last_type was undefined", name)
        }

        this.curr_type = last_type                 
    }
}