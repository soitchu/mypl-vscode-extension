import { PrintVisitor, Visitor } from "./Printer";

export enum ErrorType {
    LEXER,
    GRAMMAR,
    SEMANTIC
}

export interface MyWASMError extends Error {
    line: number;
    column: number;
    type: "Lexer" | "Grammar" | "Semantic"
}

export enum TokenType {
    EOS, ID, COMMENT,
    DOT, COMMA, LPAREN, RPAREN, LBRACKET, RBRACKET, SEMICOLON,
    LBRACE, RBRACE,
    PLUS, MINUS, TIMES, DIVIDE, MOD, ASSIGN, AND, OR, NOT,
    EQUAL, NOT_EQUAL, LESS, LESS_EQ, GREATER, GREATER_EQ,
    INT_VAL, DOUBLE_VAL, STRING_VAL, BOOL_VAL, NULL_VAL,
    INT_TYPE, DOUBLE_TYPE, STRING_TYPE, BOOL_TYPE, VOID_TYPE,
    STRUCT, FUNCTION, ARRAY, FOR, WHILE, IF, ELSEIF, ELSE, NEW, RETURN,
    IMPORT, AS, SCOPE_RESOLUTION, DELETE, EXPORT
}

export function Token(token_type: TokenType | undefined, lexeme: string, line: number, column: number): Token {
    // TODO UNCOMMENT
    // if (token_type === undefined) {
    //     throw new Error(`Unexpected error. token_type was undefined at line ${line} column ${column}`);
    // }

    return {
        token_type: token_type as TokenType,
        lexeme,
        line,
        column
    };
}

export interface Token {
    token_type: TokenType,
    lexeme: string,
    line: number,
    column: number
}

export class DataType {
    is_array: boolean
    type_name: Token
    namespace: Token | undefined

    constructor(is_array: boolean, type_name: Token, namespace: Token | undefined) {
        this.is_array = is_array;
        this.type_name = type_name;
        this.namespace = namespace;
    }

    accept(visitor: Visitor){
        visitor.visit_data_type(this);
    }
}

export class VarDef {
    data_type: DataType
    var_name: Token

    constructor(data_type: DataType, var_name: Token) {
        this.data_type = data_type;
        this.var_name = var_name;
    }

    accept(visitor: Visitor){
        visitor.visit_var_def(this);
    }
}

export class Stmt {
    accept(visitor: Visitor){}
}

export class StructDef {
    struct_name: Token
    fields: VarDef[]

    constructor(struct_name: Token, fields: VarDef[]) {
        this.struct_name = struct_name;
        this.fields = fields;
    }

    accept(visitor: Visitor){
        visitor.visit_struct_def(this);
    }
}

export class FunDef {
    return_type: DataType
    fun_name: Token
    params: VarDef[]
    stmts: Stmt[]
    original_name: string | undefined;
    shouldExport = false

    constructor(return_type: DataType, fun_name: Token, params: VarDef[], stmts: Stmt[], original_name?: string, shouldExport = false) {
        this.return_type = return_type;
        this.fun_name = fun_name;
        this.params = params;
        this.stmts = stmts;
        this.original_name = original_name;
        this.shouldExport = shouldExport;
    }

    accept(visitor: Visitor){
        visitor.visit_fun_def(this);
    }
}


export class Import {
    file_name: string
    namespace: string

    constructor(file_name: string, namespace: string) {
        this.file_name = file_name;
        this.namespace = namespace;
    }

    accept(visitor: Visitor){
        visitor.visit_import(this);
    }
}



// Expression Related export classes

export class RValue {
    accept(visitor: Visitor){}
}

export class ExprTerm {
    accept(visitor: Visitor){}
}

export class Expr {
    not_op: boolean
    first: ExprTerm
    op: Token | undefined
    rest: Expr | undefined

    constructor(
        not_op: boolean,
        first: ExprTerm,
        op: Token | undefined,
        rest: Expr | undefined
    ) {
        this.not_op = not_op;
        this.first = first;
        this.op = op;
        this.rest = rest;
    }

    accept(visitor: Visitor){
        visitor.visit_expr(this);
    }
}

// export class CallExpr(Stmt, RValue) {
export class CallExpr {
    fun_name: Token
    args: Expr[]
    namespace: Token | undefined

    constructor(fun_name: Token, args: Expr[], namespace: Token | undefined) {
        this.fun_name = fun_name;
        this.args = args;
        this.namespace = namespace;
    }

    accept(visitor: Visitor){
        visitor.visit_call_expr(this);
    }
}

export class SimpleTerm extends ExprTerm {
    rvalue: RValue

    constructor(rvalue: RValue) {
        super();
        this.rvalue = rvalue;
    }

    accept(visitor: Visitor){
        visitor.visit_simple_term(this);
    }
}

export class ComplexTerm extends ExprTerm {
    expr: Expr

    constructor(expr: Expr) {
        super();
        this.expr = expr;
    }

    accept(visitor: Visitor){
        visitor.visit_complex_term(this);
    }
}

export class SimpleRValue extends RValue {
    value: Token

    constructor(value: Token) {
        super();
        this.value = value;
    }

    accept(visitor: Visitor){
        visitor.visit_simple_rvalue(this);
    }
}

export class NewRValue extends RValue {
    type_name: Token
    array_expr: Expr | undefined
    struct_params: Expr[] | undefined
    namespace: Token | undefined

    constructor(type_name: Token, array_expr: Expr | undefined, struct_params: Expr[] | undefined, namespace: Token | undefined) {
        super();
        this.type_name = type_name;
        this.array_expr = array_expr;
        this.struct_params = struct_params;
        this.namespace = namespace;
    }

    accept(visitor: Visitor){
        visitor.visit_new_rvalue(this);
    }
}

export class VarRef {
    var_name: Token
    array_expr: Expr | undefined

    constructor(var_name: Token, array_expr: Expr |undefined) {
        this.var_name = var_name;
        this.array_expr = array_expr;
    }

    accept(visitor: Visitor){}
}

export class VarRValue extends RValue {
    path: VarRef[]

    constructor(path: VarRef[]) {
        super();
        this.path = path;
    }
    
    accept(visitor: Visitor){
        visitor.visit_var_rvalue(this);
    }

    // def accept(self, visitor):
    // visitor.visit_var_rvalue(self)
}

// Statement Related export classes

export class ReturnStmt extends Stmt {
    expr: Expr

    constructor(expr: Expr) {
        super();
        this.expr = expr;
    }

    accept(visitor: Visitor){
        visitor.visit_return_stmt(this);
    }
}

export class VarDecl extends Stmt {
    var_def: VarDef
    expr: Expr | undefined

    constructor(var_def: VarDef, expr: Expr| undefined) {
        super()
        this.var_def = var_def
        this.expr = expr
    }

    accept(visitor: Visitor){
        visitor.visit_var_decl(this);
    }
}


export class AssignStmt extends Stmt {
    lvalue: VarRef[]
    expr: Expr

    constructor(lvalue: VarRef[], expr: Expr) {
        super();
        this.lvalue = lvalue;
        this.expr = expr;
    }


    accept(visitor: Visitor){
        visitor.visit_assign_stmt(this);
    }
}

export class WhileStmt extends Stmt {
    condition: Expr
    stmts: Stmt[]

    constructor(condition: Expr, stmts: Stmt[]) {
        super();
        this.condition = condition;
        this.stmts = stmts;
    }

    accept(visitor: Visitor){
        visitor.visit_while_stmt(this);
    }
}

export class ForStmt extends Stmt {
    var_decl: VarDecl
    condition: Expr
    assign_stmt: AssignStmt
    stmts: Stmt[]

    constructor(var_decl: VarDecl, condition: Expr, assign_stmt: AssignStmt, stmts: Stmt[]) {
        super();
        this.var_decl = var_decl;
        this.condition = condition;
        this.assign_stmt = assign_stmt;
        this.stmts = stmts;
    }

    
    accept(visitor: Visitor){
        visitor.visit_for_stmt(this);
    }
}


export class DeleteStmt extends Stmt {
    var_rvalue: VarRValue

    constructor(var_rvalue: VarRValue) {
        super();
        this.var_rvalue = var_rvalue;
    }

    accept(visitor: Visitor){
        visitor.visit_delete_stmt(this);
    }
}


export class BasicIf {
    condition: Expr
    stmts: Stmt[]

    constructor(condition: Expr, stmts: Stmt[]) {
        this.condition = condition;
        this.stmts = stmts;
    }
}

export class IfStmt extends Stmt {
    if_part: BasicIf
    else_ifs: BasicIf[]
    else_stmts: Stmt[]

    constructor(if_part: BasicIf, else_ifs: BasicIf[], else_stmts: Stmt[]) {
        super();
        this.if_part = if_part;
        this.else_ifs = else_ifs;
        this.else_stmts = else_stmts;
    }

    accept(visitor: Visitor){
        visitor.visit_if_stmt(this);
    }
}


// Main program


export class Program {
    struct_defs: StructDef[]
    fun_defs: FunDef[]
    vdecl_stmts: VarDecl[]
    imports: Import[]

    constructor(struct_defs: StructDef[], fun_defs: FunDef[], vdecl_stmts: VarDecl[], imports: Import[]) {
        this.struct_defs = struct_defs;
        this.fun_defs = fun_defs;
        this.vdecl_stmts= vdecl_stmts;
        this.imports = imports;
    }

    accept(visitor: Visitor){
        visitor.visit_program(this);
    }
}
