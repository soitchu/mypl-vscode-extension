import { BUILT_INS } from "./WasmHelper";
import { Lexer } from "./Lexer";
import { SymbolTable } from "./SymbolTable";
import * as ast from "./types";

function empty_expr() {
    // @ts-expect-error
    return new ast.Expr(false, undefined, undefined, undefined);
}

const EXPR_START_TOKENS = [
    ast.TokenType.NOT,
    ast.TokenType.LPAREN,
    ast.TokenType.INT_VAL,
    ast.TokenType.DOUBLE_VAL,
    ast.TokenType.BOOL_VAL,
    ast.TokenType.STRING_VAL,
    ast.TokenType.NULL_VAL,
    ast.TokenType.NEW,
    ast.TokenType.ID,
];

const BASE_TYPE_TOKENS = [
    ast.TokenType.INT_TYPE, ast.TokenType.DOUBLE_TYPE, ast.TokenType.BOOL_TYPE, ast.TokenType.STRING_TYPE
];

const STMT_START_TOKENS = [
    ast.TokenType.WHILE, ast.TokenType.IF, ast.TokenType.FOR, ast.TokenType.RETURN, ast.TokenType.ID, ast.TokenType.ARRAY, ast.TokenType.DELETE
];

const DATA_TYPE_TOKENS = [ast.TokenType.ID, ast.TokenType.ARRAY];

STMT_START_TOKENS.push(...BASE_TYPE_TOKENS);
DATA_TYPE_TOKENS.push(...BASE_TYPE_TOKENS);

// @ts-expect-error
const EMPTY_TOKEN = ast.Token(undefined, undefined, undefined, undefined);

export class ASTParser {
    lexer: Lexer;
    curr_token: ast.Token;
    GLOBAL_NAMESPACE = "main";
    prefix: string[];
    symbol_table = new SymbolTable()
    counts = {
        "if": 0,
        "for": 0,
        "while": 0,
        "elseif": 0,
        "else": 0
    }
    shouldTransformName = true;

    constructor(lexer: Lexer, namespace: undefined | string = undefined, shouldTransformName = true) {
        this.lexer = lexer
        this.curr_token = EMPTY_TOKEN

        if (namespace !== undefined) {
            this.GLOBAL_NAMESPACE = namespace;
        }

        this.prefix = [this.GLOBAL_NAMESPACE];
        this.shouldTransformName = shouldTransformName;
    }

    parse() {
        // Start the parser, returning a Program AST node.
        const program_node = new ast.Program([], [], [], [])
        this.advance();

        while (!this.match(ast.TokenType.EOS)) {
            if (this.match(ast.TokenType.STRUCT)) {
                this.struct_def(program_node.struct_defs)
            }
            else if (this.match_any([ast.TokenType.FUNCTION, ast.TokenType.EXPORT])) {
                let shouldExport = this.match(ast.TokenType.EXPORT);
                
                if(shouldExport) {
                    this.advance();
                }

                this.eat(ast.TokenType.FUNCTION, "(112) Was expecting 'function'")
                this.fun_def(program_node.fun_defs, shouldExport)
            }
            else if (this.match(ast.TokenType.IMPORT)) {
                this.advance()

                const file_name = this.curr_token.lexeme
                let namespace = ""

                this.eat(ast.TokenType.STRING_VAL, "(104) Import token must be followed by the file name as a string")
                this.eat(ast.TokenType.AS, "(106) Was expecting 'as'")

                if (this.match_any([ast.TokenType.TIMES, ast.TokenType.ID])) {
                    if (this.match(ast.TokenType.ID)) {
                        namespace = this.curr_token.lexeme
                    }

                    this.advance()
                }
                else {
                    this.eat(ast.TokenType.ID, "(107) Was expecting an ID or the wildcard character")
                }

                this.eat(ast.TokenType.SEMICOLON, "(105) Import statement must be followed by a semicolon")

                program_node.imports.push(
                    new ast.Import(
                        file_name,
                        namespace
                    )
                )
            }
            else {
                // TODO add namespace support
                program_node.vdecl_stmts.push(
                    this.vdecl_stmt(false, undefined, true)
                )

                this.eat(ast.TokenType.SEMICOLON, "Was expecting a semicolon")
            }

        }

        this.eat(ast.TokenType.EOS, 'expecting EOF')

        return program_node;

    }

    //----------------------------------------------------------------------
    // Helper functions
    //----------------------------------------------------------------------

    error(message: string): never {
        const grammarError = new Error(message) as ast.MyWASMError;
        const line = this.curr_token.line;
        const column = this.curr_token.column;

        grammarError.message += ` found ${this.curr_token.lexeme}`
        grammarError.line = line;
        grammarError.column = column;
        grammarError.type = "Grammar";

        throw grammarError;
    }


    advance() {
        // Moves to the next token of the lexer

        this.curr_token = this.lexer.next_token()

        // skip comments
        while (this.match(ast.TokenType.COMMENT)) {
            this.curr_token = this.lexer.next_token()
        }
    }


    match(token_type: ast.TokenType) {
        //True if the current token type matches the given one.
        return this.curr_token.token_type === token_type
    }


    match_any(token_types: ast.TokenType[]) {
        // True if current token type matches on of the given ones.

        for (const token_type of token_types) {
            if (this.match(token_type)) {
                return true;
            }
        }

        return false;
    }

    eat(token_type: ast.TokenType, message: string) {
        // Advances to next token if current tokey type matches given one,
        // otherwise produces and error with the given message.

        if (!this.match(token_type)) {
            this.error(message);
        }

        this.advance();
    }


    is_bin_op() {
        // Returns true if the current token is a binary operator

        const ts = [ast.TokenType.PLUS, ast.TokenType.MINUS, ast.TokenType.TIMES, ast.TokenType.DIVIDE,
        ast.TokenType.AND, ast.TokenType.OR, ast.TokenType.EQUAL, ast.TokenType.LESS,
        ast.TokenType.GREATER, ast.TokenType.LESS_EQ, ast.TokenType.GREATER_EQ,
        ast.TokenType.NOT_EQUAL, ast.TokenType.MOD]

        return this.match_any(ts)
    }

    get_name_with_prefix(name: string) {
        if (!this.shouldTransformName) return name;

        let count = 0;
        let last_scope_type = "";

        if (this.prefix.length > 0) {
            last_scope_type = this.prefix[-1];
        }

        if (last_scope_type in this.counts) {
            count = this.counts[last_scope_type];
        }

        if (this.symbol_table.exists_in_curr_env(name)) {
            return this.prefix.join("_") + count.toString() + "_" + name;
        }
        else {
            const binding = this.symbol_table.get(name);

            if (binding !== undefined) {
                return binding.type_name.lexeme;
            }
        }

        if (this.GLOBAL_NAMESPACE && this.GLOBAL_NAMESPACE != "") {
            return this.GLOBAL_NAMESPACE + "_" + name;
        }
        else {
            return name;
        }
    }

    //----------------------------------------------------------------------
    // Recursive descent functions
    //----------------------------------------------------------------------

    struct_def(struct_defs: ast.StructDef[]) {
        /**
            NOTE: FIRST TOKEN MUST BE STRUCT
            
            Check for well-formed struct definition.
            Grammar: STRUCT ID LBRACE <fields> RBRACE
        */

        // Advancing since we know that the first token is a STRUCT
        this.advance()

        const struct_node = new ast.StructDef(this.curr_token, [])

        struct_node.struct_name.lexeme = this.get_name_with_prefix(struct_node.struct_name.lexeme);

        // # this.symbol_table.add(
        // #     struct_node.struct_name.lexeme, 
        // #     ast.DataType(
        // #         False,
        // #         struct_node.struct_name
        // #     )
        // # )

        this.eat(ast.TokenType.ID, "(1) structs must begin with an ID, but")
        this.eat(ast.TokenType.LBRACE, "(2) struct IDs must be succeeded by an LBRACE")
        this.fields(struct_node.fields)
        this.eat(ast.TokenType.RBRACE, "(3) structs must have a closing RBRACE")

        struct_defs.push(struct_node);
    }

    fields(fields: ast.VarDef[]) {
        /**
            Check for well-formed struct fields.
            Grammar: <data_type> ID ( SEMICOLON <data_type> ID )∗ | ϵ
        */

        while (this.match_any(DATA_TYPE_TOKENS)) {
            const data_type = new ast.DataType(false, EMPTY_TOKEN, undefined);

            this.data_type(data_type)

            const field = new ast.VarDef(data_type, this.curr_token)

            this.eat(ast.TokenType.ID, "(4) Data type must be succeeded by an ID");
            this.eat(ast.TokenType.SEMICOLON, "(62) Was expecting semicolon, but");

            fields.push(field)
        }
    }

    is_base_type() {
        return this.match_any([ast.TokenType.INT_TYPE, ast.TokenType.DOUBLE_TYPE, ast.TokenType.BOOL_TYPE, ast.TokenType.STRING_TYPE])
    }

    data_type(data_type: ast.DataType) {
        /**
            Grammar: <base_type> | (ID :: | ϵ) ID | ARRAY ( <base_type> | ID )
        */

        if (!(this.match_any(BASE_TYPE_TOKENS) || this.match_any([ast.TokenType.ARRAY, ast.TokenType.ID]))) {
            this.error("(7) Data types must be an ID, BASE_TYPE or an array");
        }

        if (this.match(ast.TokenType.ARRAY)) {
            // Advance from the ARRAY token
            this.advance()
            data_type.is_array = true
        }

        const was_id = this.match(ast.TokenType.ID)

        if (this.match_any(BASE_TYPE_TOKENS) || was_id) {
            if (!was_id) {
                data_type.type_name = this.curr_token
                this.advance()
            }
            else {
                let has_namespace = false;
                const id_token = this.curr_token;
                this.advance();

                if (this.match(ast.TokenType.SCOPE_RESOLUTION)) {
                    this.advance()

                    data_type.namespace = id_token
                    data_type.namespace.lexeme = this.GLOBAL_NAMESPACE + "_" + data_type.namespace.lexeme

                    data_type.type_name = this.curr_token

                    this.eat(ast.TokenType.ID, "(109) The scope resolution operator must be followed by an ID")
                    has_namespace = true
                }
                else {
                    data_type.type_name = id_token
                }

                if (!has_namespace) {
                    data_type.type_name.lexeme = this.get_name_with_prefix(data_type.type_name.lexeme)
                }
            }
        }
        else {
            this.error("(6) Was expecting a user-defined type or a base type")
        }

    }

    fun_def(fun_defs: ast.FunDef[], shouldExport: boolean) {
        /**
            Check for well-formed function definition.
            Grammar: (EXPORT | ϵ) FUNCTION ( <data_type> | VOID_TYPE ) ID LPAREN <params> RPAREN  LBRACE ( <stmt> )∗ RBRACE
        */

        this.symbol_table.push_environment()
        // this.prefix.append("function")

        this.counts = {
            "if": 0,
            "for": 0,
            "while": 0,
            "elseif": 0,
            "else": 0,
        }

        const return_type: ast.DataType = new ast.DataType(false, EMPTY_TOKEN, undefined);
        const params: ast.VarDef[] = [];
        const stmts: ast.Stmt[] = [];

        if (this.curr_token.token_type == ast.TokenType.VOID_TYPE) {
            return_type.is_array = false;
            return_type.type_name = this.curr_token;

            this.advance()
        }
        else {
            // # it must be a <data_type>
            this.data_type(return_type)
        }

        const fun_name = this.curr_token;
        const original_fun_name = fun_name.lexeme;
        // # this.symbol_table.add(
        // #     fun_name.lexeme, 
        // #     return_type
        // # )

        // # TODO add exception for imported scripts
        fun_name.lexeme = this.get_name_with_prefix(fun_name.lexeme);

        this.prefix.push(fun_name.lexeme);


        this.eat(ast.TokenType.ID, "(8) Functions must have an ID, but")
        this.eat(ast.TokenType.LPAREN, "(9) Function IDs must be succeeded by an LPAREN, but")

        this.params(params)

        this.eat(ast.TokenType.RPAREN, "(10) Functions must have a closing RPAREN after the parameter list, but")
        this.eat(ast.TokenType.LBRACE, "(11) The closing RPAREN must be followed by an LBRACE, but ")

        if (this.match(ast.TokenType.RBRACE)) {
            this.advance()
        }
        else {
            // # Since it isn't an RBRACE, it must have atleast one stmt
            this.stmt(stmts)

            // # Checking if it is still an stmt:
            while (this.match_any(STMT_START_TOKENS)) {
                this.stmt(stmts)
            }

            this.eat(ast.TokenType.RBRACE, "(12) Functions must have a matching closing RBRACE, but")
        }

        fun_defs.push(new ast.FunDef(
            return_type,
            fun_name,
            params,
            stmts,
            original_fun_name,
            shouldExport
        ))

        this.prefix.pop()
        this.symbol_table.pop_environment()
    }

    params(params: ast.VarDef[]) {
        /**
            Grammar: <data_type> ID ( COMMA <data_type> ID )∗ | ϵ
        */

        if (!this.match_any(DATA_TYPE_TOKENS)) {
            // We don't need to do anything since it is ϵ
            return
        }

        let data_type = new ast.DataType(false, EMPTY_TOKEN, undefined);

        this.data_type(data_type)

        params.push(new ast.VarDef(
            data_type,
            this.curr_token
        ))

        this.symbol_table.add(this.curr_token.lexeme, new ast.DataType(false, this.curr_token, undefined))
        this.curr_token.lexeme = this.get_name_with_prefix(this.curr_token.lexeme)

        this.eat(ast.TokenType.ID, "(13) Function parameter types must be followed by an ID, but")

        while (this.match(ast.TokenType.COMMA)) {
            // # Advance from the COMMA
            this.advance()

            data_type = new ast.DataType(false, EMPTY_TOKEN, undefined)

            this.data_type(data_type)

            params.push(new ast.VarDef(
                data_type,
                this.curr_token
            ))

            this.symbol_table.add(this.curr_token.lexeme, new ast.DataType(false, this.curr_token, undefined))
            this.curr_token.lexeme = this.get_name_with_prefix(this.curr_token.lexeme)

            this.eat(ast.TokenType.ID, "(14) Function parameter types must be followed by an ID, but")
        }
    }

    stmt(stmts: ast.Stmt[]) {
        /** 
            Grammar: <while_stmt> | <if_stmt> | <for_stmt> | <return_stmt> SEMICOLON |
                     <vdecl_stmt> SEMICOLON | <assign_stmt> SEMICOLON | <call_expr> SEMICOLON
        */

        // <while_stmt>  : WHILE...
        // <if_stmt>     : IF...
        // <for_stmt>    : FOR...
        // <return_stmt> : RETURN...
        // <vdecl_stmt>  : (<base_type> | ID | ARRAY ( <base_type> | ID )) ID ( ASSIGN <expr> | ϵ )
        // <assign_stmt> : ID ( LBRACKET <expr> RBRACKET | ϵ ) 
        // <call_expr>   : ID LPAREN ( <expr> ( COMMA <expr> )∗ | ϵ ) RPAREN

        if (this.match_any(BASE_TYPE_TOKENS) || this.match(ast.TokenType.ARRAY)) {
            stmts.push(
                this.vdecl_stmt()
            )

            this.eat(ast.TokenType.SEMICOLON, "(15) Variable declarations must be followed by a semicolon, but");
            return;
        }



        switch (this.curr_token.token_type) {
            case ast.TokenType.DELETE:
                stmts.push(
                    this.delete_stmt()
                )
                break;
            case ast.TokenType.WHILE:
                stmts.push(
                    this.while_stmt()
                )
                break;
            case ast.TokenType.IF:
                stmts.push(
                    this.if_stmt()
                )
                break;
            case ast.TokenType.FOR:
                stmts.push(
                    this.for_stmt()
                )
                break;
            case ast.TokenType.RETURN:
                stmts.push(
                    this.return_stmt()
                )

                this.eat(ast.TokenType.SEMICOLON, "(27) return statememts must end with a semicolon, but")
                break;
            case ast.TokenType.ID:
                let id_token = this.curr_token
                let namespace: ast.Token | undefined = undefined;

                this.advance()

                if (this.match(ast.TokenType.SCOPE_RESOLUTION)) {
                    this.advance()
                    namespace = id_token
                    namespace.lexeme = this.GLOBAL_NAMESPACE + "_" + namespace.lexeme
                    id_token = this.curr_token

                    this.eat(ast.TokenType.ID, "(109) The scope resolution operator must be followed by an ID")
                }

                const data_type = new ast.DataType(false, id_token, namespace)

                if (this.match(ast.TokenType.LPAREN)) {
                    if (!BUILT_INS.includes(id_token.lexeme) && namespace === undefined) {
                        id_token.lexeme = this.get_name_with_prefix(id_token.lexeme)
                    }

                    // # if namespace is not None:
                    // #     namespace.lexeme = this.GLOBAL_NAMESPACE + "_" + namespace.lexeme

                    stmts.push(
                        this.call_expr(id_token, namespace)
                    )
                    this.eat(ast.TokenType.SEMICOLON, "(17) Call expressions must be followed by a semicolon, but")
                }
                else if (this.match(ast.TokenType.ID)) {
                    stmts.push(
                        this.vdecl_stmt(true, data_type, false, namespace)
                    )

                    this.eat(ast.TokenType.SEMICOLON, "(60) Variable declarations must be followed by a semicolon, but")
                }
                else {
                    id_token.lexeme = this.get_name_with_prefix(id_token.lexeme)

                    stmts.push(
                        this.assign_stmt(data_type)
                    )

                    this.eat(ast.TokenType.SEMICOLON, "(18) Assign statements must be followed by a semicolon, but")
                }
                break;
        }

    }

    delete_stmt() {
        // Advancing from delete
        this.advance()

        const id_token = this.curr_token

        id_token.lexeme = this.get_name_with_prefix(id_token.lexeme);
        this.advance()

        const stmt = new ast.DeleteStmt(
            this.var_rvalue(new ast.DataType(false, id_token, undefined))
        )

        this.eat(ast.TokenType.SEMICOLON, "(111) Was expecting a semicolon")

        return stmt
    }

    if_stmt() {
        /**
            Grammar: IF LPAREN <expr> RPAREN LBRACE ( <stmt> )∗ RBRACE <if_stmt_t>
        */

        this.counts.if += 1;
        this.prefix.push("if" + this.counts["if"].toString());
        this.symbol_table.push_environment();


        this.eat(ast.TokenType.IF, "(49) if statements must begin with IF, but")
        this.eat(ast.TokenType.LPAREN, "(50) IF must be followed by an opening LPAREN")

        const condition = this.expr(empty_expr())

        this.eat(ast.TokenType.RPAREN, "(51) IF expressions must be followed by a closing RPAREN")
        this.eat(ast.TokenType.LBRACE, "(52) Was expecting LBRACE, but")

        const stmt_list: ast.Stmt[] = []

        while (this.match_any(STMT_START_TOKENS)) {
            this.stmt(stmt_list)
        }

        this.eat(ast.TokenType.RBRACE, "(53) Was expecting closing RBRACE, but")


        const else_ifs: ast.BasicIf[] = [];
        const else_stmts: ast.Stmt[] = []

        this.symbol_table.pop_environment()
        this.prefix.pop()
        // this.counts["if"] -= 1

        this.if_stmt_t(else_ifs, else_stmts)

        return new ast.IfStmt(
            new ast.BasicIf(condition, stmt_list),
            else_ifs,
            else_stmts
        )
    }

    if_stmt_t(else_ifs: ast.BasicIf[], else_stmts: ast.Stmt[]) {
        /**
            Grammer: ELSEIF LPAREN <expr> RPAREN LBRACE ( <stmt> )∗ RBRACE <if_stmt_t> |
                     ELSE LBRACE ( <stmt> )∗ RBRACE | 
                     ϵ
        */


        if (this.match(ast.TokenType.ELSEIF)) {
            this.counts["elseif"] += 1
            this.prefix.push("elseif" + this.counts["elseif"].toString())

            this.symbol_table.push_environment()

            const stmt_list: ast.Stmt[] = []

            this.advance()
            this.eat(ast.TokenType.LPAREN, "(54) elseif keyword must be followed by LPAREN, but")

            const condition = this.expr(empty_expr());

            this.eat(ast.TokenType.RPAREN, "(55) Was expecting closing RPAREN, but")
            this.eat(ast.TokenType.LBRACE, "(56) Was expecting LBRACE, but")

            while (this.match_any(STMT_START_TOKENS)) {
                this.stmt(stmt_list)
            }

            this.eat(ast.TokenType.RBRACE, "(57) Was expecting closing RBRACE, but")

            else_ifs.push(
                new ast.BasicIf(
                    condition,
                    stmt_list
                )
            )

            this.symbol_table.pop_environment()
            this.prefix.pop()


            this.if_stmt_t(else_ifs, else_stmts)
        }
        else if (this.match(ast.TokenType.ELSE)) {
            this.counts["else"] += 1
            this.prefix.push("else" + this.counts["else"].toString())

            this.symbol_table.push_environment()

            const stmt_list: ast.Stmt[] = []

            this.advance()
            this.eat(ast.TokenType.LBRACE, "(58) Was expecting LBRACE, but")

            while (this.match_any(STMT_START_TOKENS)) {
                this.stmt(stmt_list)
            }

            else_stmts.push(...stmt_list)

            this.eat(ast.TokenType.RBRACE, "(59) Was expecting closing RBRACE, but")

            this.symbol_table.pop_environment()
            this.prefix.pop()
        }
    }


    while_stmt() {
        /**
           Grammar: WHILE LPAREN <expr> RPAREN LBRACE ( <stmt> )∗ RBRACE
        */

        this.counts.while += 1;
        this.prefix.push("while" + this.counts["while"].toString())

        this.symbol_table.push_environment()

        this.eat(ast.TokenType.WHILE, "(44) while statements must begin with WHILE, but")
        this.eat(ast.TokenType.LPAREN, "(45) WHILE must be followed by an opening LPAREN")

        const condition = this.expr(empty_expr())

        this.eat(ast.TokenType.RPAREN, "(46) WHILE expressions must be followed by a closing RPAREN")
        this.eat(ast.TokenType.LBRACE, "(47) Was expecting LBRACE, but")

        const stmt_list = []

        while (this.match_any(STMT_START_TOKENS)) {
            this.stmt(stmt_list)
        }

        this.eat(ast.TokenType.RBRACE, "(48) Was expecting closing RBRACE, but")

        this.symbol_table.pop_environment()
        this.prefix.pop()

        return new ast.WhileStmt(
            condition,
            stmt_list
        )
    }

    for_stmt() {
        // Grammar: FOR LPAREN <vdecl_stmt> SEMICOLON <expr> SEMICOLON
        //          <assign_stmt> <RPAREN> LBRACE ( <stmt> )∗ RBRACE

        this.counts["for"] += 1
        this.prefix.push("for" + this.counts["for"].toString())

        this.symbol_table.push_environment()

        this.eat(ast.TokenType.FOR, "(19) For statememnts must begin with the keyword \"for\", but")
        this.eat(ast.TokenType.LPAREN, "(20) for keyword must be followed by an LPAREN, but")

        const var_decl = this.vdecl_stmt()

        this.eat(ast.TokenType.SEMICOLON, "(21) for's variable declarations must be followed by a semicolon, but")

        const condition = this.expr(empty_expr())

        this.eat(ast.TokenType.SEMICOLON, "(22) for's conditional expressions must be followed by a semicolon, but")

        this.curr_token.lexeme = this.get_name_with_prefix(this.curr_token.lexeme)

        const data_type = new ast.DataType(
            false,
            this.curr_token,
            undefined
        )

        this.eat(ast.TokenType.ID, "(61) Was expecting ID, but")

        const assign_stmt = this.assign_stmt(data_type)

        const stmt_list = []

        this.eat(ast.TokenType.RPAREN, "(23) for's assignment statements must be followed by an RPAREN, but")
        this.eat(ast.TokenType.LBRACE, "(24) for's RPAREN but be followed by an LBRACE, but")

        while (this.match_any(STMT_START_TOKENS)) {
            this.stmt(stmt_list);
        }

        this.eat(ast.TokenType.RBRACE, "(25) for must have have matching closing RBRACE, but")

        this.symbol_table.pop_environment()
        this.prefix.pop()

        return new ast.ForStmt(
            var_decl,
            condition,
            assign_stmt,
            stmt_list
        )
    }

    return_stmt() {
        // Grammar: RETURN <expr> SEMICOLON
        this.eat(ast.TokenType.RETURN, "(26) return statements must begin with RETURN, but")

        return new ast.ReturnStmt(
            this.expr(empty_expr())
        )
    }

    assign_stmt(data_type: ast.DataType) {
        /** 
            NOTE: ID must be eaten before calling this method
            Grammar: <lvalue> ASSIGN <expr>
        */

        const lvalues = this.lvalue(data_type)
        this.eat(ast.TokenType.ASSIGN, "(28) Lvalues must be followed by an ASSIGN, but")

        const expr = this.expr(empty_expr())

        return new ast.AssignStmt(lvalues, expr);
    }

    lvalue(data_type: ast.DataType) {
        // Grammar: (ID :: | ϵ) ID ( LBRACKET <expr> RBRACKET | ϵ ) ( DOT ID ( LBRACKET <expr> RBRACKET | ϵ ) )∗

        let namespace = undefined;
        let var_ref = new ast.VarRef(data_type.type_name, undefined)

        const var_ref_list: ast.VarRef[] = [
            var_ref
        ];

        if (this.match(ast.TokenType.LBRACKET)) {
            this.advance()
            var_ref.array_expr = this.expr(empty_expr())
            this.eat(ast.TokenType.RBRACKET, "(30) Missing matching RBRACKET,")
        }


        while (this.match(ast.TokenType.DOT)) {
            this.advance()

            var_ref = new ast.VarRef(this.curr_token, undefined)

            var_ref_list.push(var_ref)

            this.eat(ast.TokenType.ID, "(31) DOT must be followed by an ID, but")

            if (this.match(ast.TokenType.LBRACKET)) {
                this.advance()
                var_ref.array_expr = this.expr(empty_expr())
                this.eat(ast.TokenType.RBRACKET, "(32) Missing matching RBRACKET,")
            }
        }

        return var_ref_list
    }

    call_expr(id_token: ast.Token, namespace: ast.Token | undefined) {
        /**
            NOTE: ID MUST BE EATEN BEFORE CALLING THIS METHOD
            Grammar: ID (:: ID | ϵ) LPAREN ( <expr> ( COMMA <expr> )∗ | ϵ ) RPAREN
        */

        const expr_list: ast.Expr[] = []

        this.eat(ast.TokenType.LPAREN, "(33) call expression IDs must be followed by an LPAREN")

        if (this.match_any(EXPR_START_TOKENS)) {
            expr_list.push(
                this.expr(
                    empty_expr()
                )
            )

            while (this.match(ast.TokenType.COMMA)) {
                this.advance()
                expr_list.push(
                    this.expr(
                        empty_expr()
                    )
                )
            }
        }


        this.eat(ast.TokenType.RPAREN, "(34) Missing matching RPAREN")

        // # if namespace is not None and namespace != "":
        // #     namespace.lexeme = this.GLOBAL_NAMESPACE + "_" + namespace.lexeme

        return new ast.CallExpr(id_token, expr_list, namespace)
    }


    vdecl_stmt(
        has_eaten_type = false,
        data_type: ast.DataType | undefined = undefined,
        expect_literal = false,
        namespace: ast.Token | undefined = undefined
    ) {
        /**
            Grammar: <data_type> ID ( ASSIGN <expr> | ϵ )
        */


        if (!has_eaten_type) {
            data_type = new ast.DataType(false, EMPTY_TOKEN, undefined)
            this.data_type(data_type)
        }

        if (data_type === undefined) {
            this.error("(100) Unexpected Error - data_type was None. ")
        }

        if (has_eaten_type && namespace === undefined) {
            data_type.type_name.lexeme = this.get_name_with_prefix(data_type.type_name.lexeme)
        }

        const var_def = new ast.VarDef(data_type, this.curr_token)
        let expr: ast.Expr | undefined = undefined

        this.symbol_table.add(this.curr_token.lexeme, new ast.DataType(false, this.curr_token, undefined))
        this.curr_token.lexeme = this.get_name_with_prefix(this.curr_token.lexeme)

        this.eat(ast.TokenType.ID, "(35) Data types must be followed by an ID, but")

        if (this.match(ast.TokenType.ASSIGN)) {
            this.advance()

            expr = this.expr(empty_expr())
            // # TODO: make this actually part of the grammar

            if (expect_literal) {
                if (expr.op !== undefined || expr.rest !== undefined) {
                    this.error("(101) Global variables must have a literal value")
                }

                if (!(expr.first instanceof ast.SimpleTerm) || !(expr.first.rvalue instanceof ast.SimpleRValue)) {
                    this.error("(103) Global variables must have a literal value")
                }
            }
        }
        else if (expect_literal) {
            this.error("(102) Global variables must be initialized")
        }

        return new ast.VarDecl(var_def, expr)
    }

    expr(expr: ast.Expr): ast.Expr {
        /**
            Grammar: ( <rvalue> | NOT <expr> | LPAREN <expr> RPAREN ) ( <bin_op> <expr> | ϵ )
        */

        if (expr === undefined) {
            // @ts-expect-error
            return
        }

        if (this.match(ast.TokenType.NOT)) {
            expr.not_op = !expr.not_op;
            this.advance()
            this.expr(
                expr
            )
        }
        else if (this.match(ast.TokenType.LPAREN)) {
            this.advance()
            expr.first = new ast.ComplexTerm(
                this.expr(
                    empty_expr()
                ) as ast.Expr
            )
            this.eat(ast.TokenType.RPAREN, "(36) Missing closing RPAREN. ")
        }
        else {
            expr.first = new ast.SimpleTerm(this.rvalue())
        }

        if (this.is_bin_op()) {
            expr.op = this.curr_token
            this.advance()
            expr.rest = this.expr(
                empty_expr()
            )
        }

        return expr;
    }


    var_rvalue(data_type: ast.DataType) {
        /**
            Grammar: ID ( LBRACKET <expr> RBRACKET | ϵ ) ( DOT ID ( LBRACKET <expr> RBRACKET | ϵ ) )∗
        */

        return new ast.VarRValue(
            this.lvalue(data_type)
        )
    }

    rvalue(): ast.RValue {
        /** 
            Grammar: <base_rvalue> | NULL_VAL | <new_rvalue> | <var_rvalue> | <call_expr>
        */

        // # rval = ast.SimpleRValue()
        let token = EMPTY_TOKEN
        let val: ast.RValue | undefined = undefined;

        if (this.match_any([ast.TokenType.NULL_VAL, ast.TokenType.INT_VAL, ast.TokenType.DOUBLE_VAL, ast.TokenType.BOOL_VAL, ast.TokenType.STRING_VAL])) {
            token = this.curr_token
            val = new ast.SimpleRValue(token)
            this.advance()
        }
        else if (this.match(ast.TokenType.NEW)) {
            val = this.new_rvalue();
        }
        else if (this.match(ast.TokenType.ID)) {

            let id_token = this.curr_token

            this.advance()


            if (this.match_any([ast.TokenType.LPAREN, ast.TokenType.SCOPE_RESOLUTION])) {
                let namespace: ast.Token | undefined = undefined;

                if (this.match(ast.TokenType.SCOPE_RESOLUTION)) {
                    this.advance()
                    namespace = id_token
                    namespace.lexeme = this.GLOBAL_NAMESPACE + "_" + namespace.lexeme
                    id_token = this.curr_token

                    this.eat(ast.TokenType.ID, "(109) The scope resolution operator must be followed by an ID")
                }

                if (!BUILT_INS.includes(id_token.lexeme) && namespace === undefined) {
                    id_token.lexeme = this.get_name_with_prefix(id_token.lexeme)
                }

                val = this.call_expr(id_token, namespace)
            }
            else {
                id_token.lexeme = this.get_name_with_prefix(id_token.lexeme)
                val = this.var_rvalue(new ast.DataType(false, id_token, undefined))
            }
        }
        else {
            this.error("(43) Malformed rvalue. ")
        }

        return val as ast.RValue;
    }

    new_rvalue() {
        /**
            Grammar: NEW (ID :: | ϵ ) ID LPAREN ( <expr> ( COMMA <expr> )∗ | ϵ ) RPAREN |
                     NEW ( (ID :: | ϵ ) ID  | <base_type> ) LBRACKET <expr> RBRACKET
        */

        let type_name: ast.Token = EMPTY_TOKEN
        let struct_params: ast.Expr[] | undefined = undefined
        let array_expr: ast.Expr | undefined = undefined

        // # Advancing NEW
        this.advance();

        let namespace: ast.Token | undefined = undefined

        if (this.match(ast.TokenType.ID)) {
            type_name = this.curr_token
            this.advance()

            if (this.match(ast.TokenType.SCOPE_RESOLUTION)) {
                this.advance()
                namespace = type_name
                namespace.lexeme = this.GLOBAL_NAMESPACE + "_" + namespace.lexeme
                type_name = this.curr_token

                this.eat(ast.TokenType.ID, "(110) The scope resolution operator must be followed by an ID")
            }
            else {
                type_name.lexeme = this.get_name_with_prefix(type_name.lexeme)
            }

            if (this.match(ast.TokenType.LPAREN)) {
                this.advance()

                struct_params = []

                if (this.match_any(EXPR_START_TOKENS)) {
                    struct_params.push(
                        this.expr(empty_expr())
                    )
                }

                while (this.match(ast.TokenType.COMMA)) {
                    this.advance()
                    struct_params.push(
                        this.expr(empty_expr())
                    )
                }

                this.eat(ast.TokenType.RPAREN, "(37) Missing closing RPAREN")
            }
            else {
                // # TODO: refactor
                this.eat(ast.TokenType.LBRACKET, "(38) Missing opening LBRACKET")
                array_expr = this.expr(empty_expr())
                this.eat(ast.TokenType.RBRACKET, "(39) Missing closing RBRACKET")
            }
        }
        else {
            if (!this.match_any(BASE_TYPE_TOKENS)) {
                this.error("(40) Was expecting a BASE_TYPE")
            }

            type_name = this.curr_token

            this.advance()
            this.eat(ast.TokenType.LBRACKET, "(41) Missing opening LBRACKET")
            array_expr = this.expr(empty_expr())
            this.eat(ast.TokenType.RBRACKET, "(42) Missing closing RBRACKET")
        }


        const rval = new ast.NewRValue(type_name, array_expr, struct_params, namespace)

        return rval
    }
}