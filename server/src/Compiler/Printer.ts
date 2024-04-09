import { AssignStmt, CallExpr, ComplexTerm, DataType, DeleteStmt, Expr, ForStmt, FunDef, IfStmt, Import, NewRValue, Program, ReturnStmt, SimpleRValue, SimpleTerm, Stmt, StructDef, TokenType, VarDecl, VarDef, VarRValue, WhileStmt } from "./types";

export class Visitor {
    visit_program(program: Program) {}
    visit_struct_def(struct_def: StructDef) {}
    visit_fun_def(fun_def: FunDef) {}
    visit_return_stmt(return_stmt: ReturnStmt) {}
    visit_var_decl(var_decl: VarDecl) {}
    visit_assign_stmt(assign_stmt: AssignStmt) {}
    visit_while_stmt(while_stmt: WhileStmt) {}
    visit_for_stmt(for_stmt: ForStmt) {}
    visit_if_stmt(if_stmt: IfStmt) {}
    visit_call_expr(call_expr: CallExpr) {}
    visit_expr(expr: Expr) {}
    visit_data_type(data_type: DataType) {}
    visit_var_def(var_def: VarDef) {}
    visit_simple_term(simple_term: SimpleTerm) {}
    visit_complex_term(complex_term: ComplexTerm) {}
    visit_simple_rvalue(simple_rvalue: SimpleRValue) {}
    visit_new_rvalue(new_rvalue: NewRValue) {}
    visit_var_rvalue(var_rvalue: VarRValue) {}
    visit_delete_stmt(delete_stmt: DeleteStmt){}
    visit_import(import_stmt: Import){}
}



export class PrintVisitor extends Visitor {
    indent = 0;

    output(msg: string) {
        console.log(msg);
        // process.stdout.write(msg);
    }

    output_with_indent(msg) {
        this.output_indent();
        this.output(msg);
    }

    output_indent() {
        this.output('  '.repeat(this.indent));
    }

    output_semicolon(stmt) {
        if (stmt instanceof VarDecl || stmt instanceof AssignStmt || stmt instanceof ReturnStmt || stmt instanceof CallExpr) {
            this.output(';');
        }
    }

    print_stmts(stmts: Stmt[]) {
        for (let stmt of stmts) {
            this.output_indent();
            stmt.accept(this);
            this.output_semicolon(stmt);
            this.output('\n');
        }
    }

    print_basic_if(condition: Expr, stmts: Stmt[], prefix = "if") {
        if (prefix === "if") {
            this.output(prefix);
        } else {
            this.output_with_indent(prefix);
        }
        this.output(" (");
        condition.accept(this);
        this.output(") {\n");
        this.indent += 1;
        this.print_stmts(stmts);
        this.indent -= 1;
        this.output_with_indent("}");
    }

    print_with_commans(l) {
        for (let i = 0; i < l.length; i++) {
            l[i].accept(this);
            if (i < l.length - 1) {
                this.output(', ');
            }
        }
    }

    visit_program(program: Program) {
        for (let stmt of program.imports) {
            stmt.accept(this);
        }

        for (let stmt of program.vdecl_stmts) {
            stmt.accept(this);
            this.output(';\n');
        }

        this.output("\n");

        for (let struct of program.struct_defs) {
            struct.accept(this);
            this.output('\n');
        }

        for (let fun of program.fun_defs) {
            fun.accept(this);
            this.output('\n');
        }
    }

    visit_import(import_stmt: Import) {
        this.output("import \"");
        this.output(import_stmt.file_name);
        this.output(`\" as ${import_stmt.namespace};\n`);
    }

    visit_struct_def(struct_def: StructDef) {
        this.output('struct ' + struct_def.struct_name.lexeme + ' {\n');
        this.indent += 1;
        for (let var_def of struct_def.fields) {
            this.output_indent();
            var_def.accept(this);
            this.output(';\n');
        }
        this.indent -= 1;
        this.output('}\n');
    }

    visit_for_stmt(for_stmt: ForStmt) {
        this.output("for (");
        for_stmt.var_decl.accept(this);
        this.output("; ");
        for_stmt.condition.accept(this);
        this.output("; ");
        for_stmt.assign_stmt.accept(this);
        this.output(") {\n");
        this.indent += 1;
        this.print_stmts(for_stmt.stmts);
        this.indent -= 1;
        this.output_with_indent("}");
    }

    visit_while_stmt(while_stmt: WhileStmt) {
        this.output("while (");
        while_stmt.condition.accept(this);
        this.output(") {\n");
        this.indent += 1;
        this.print_stmts(while_stmt.stmts);
        this.indent -= 1;
        this.output_with_indent("}");
    }


    visit_simple_rvalue(simple_rvalue: SimpleRValue) {
        let token_type = simple_rvalue.value.token_type;
        if (token_type === TokenType.STRING_VAL) {
            this.output("\"");
        }
        this.output(simple_rvalue.value.lexeme);
        if (token_type === TokenType.STRING_VAL) {
            this.output("\"");
        }
    }

    visit_var_rvalue(var_rvalue: VarRValue) {
        let first = true;
        for (let ref of var_rvalue.path) {
            if (!first) {
                this.output(".");
            }
            this.output(ref.var_name.lexeme);
            if (ref.array_expr !== undefined) {
                this.output("[");
                ref.array_expr.accept(this);
                this.output("]");
            }
            first = false;
        }
    }

    visit_simple_term(simple_term: SimpleTerm) {
        simple_term.rvalue.accept(this);
    }

    visit_var_def(var_def: VarDef) {
        var_def.data_type.accept(this);
        this.output(" " + var_def.var_name.lexeme);
    }

    visit_assign_stmt(assign_stmt: AssignStmt) {
        let first = true;
        for (let ref of assign_stmt.lvalue) {
            if (!first) {
                this.output(".");
            }
            this.output(ref.var_name.lexeme);
            if (ref.array_expr !== undefined) {
                this.output("[");
                ref.array_expr.accept(this);
                this.output("]");
            }
            first = false;
        }
        this.output(" = ");
        assign_stmt.expr.accept(this);
    }

    visit_if_stmt(if_stmt: IfStmt, prefix = "if") {
        this.print_basic_if(if_stmt.if_part.condition, if_stmt.if_part.stmts, "if");
        if (if_stmt.else_ifs.length > 0 || if_stmt.else_stmts.length > 0) {
            this.output("\n");
        }
        for (let else_if of if_stmt.else_ifs) {
            this.print_basic_if(else_if.condition, else_if.stmts, "elseif");
            if (else_if !== if_stmt.else_ifs[if_stmt.else_ifs.length - 1] || if_stmt.else_stmts.length !== 0) {
                this.output("\n");
            }
        }
        if (if_stmt.else_stmts.length) {
            this.output_with_indent("else {\n");
            this.indent += 1;
            this.print_stmts(if_stmt.else_stmts);
            this.indent -= 1;
            this.output_with_indent("}");
        }
    }

    visit_var_decl(var_decl: VarDecl) {
        var_decl.var_def.accept(this);
        this.output(" = ");
        if (var_decl.expr !== undefined) {
            var_decl.expr.accept(this);
        }
    }

    visit_return_stmt(return_stmt: ReturnStmt) {
        this.output("return ");
        return_stmt.expr.accept(this);
    }

    visit_complex_term(complex_term: ComplexTerm) {
        this.output("(");
        complex_term.expr.accept(this);
        this.output(")");
    }

    visit_expr(expr: Expr) {
        if (expr.not_op) {
            this.output("not ");
            this.output("(");
        }

        if (expr.first !== undefined) {
            expr.first.accept(this);
        }

        if (expr.op !== undefined) {
            this.output(" " + expr.op.lexeme + " ");
        }

        if (expr.rest !== undefined) {
            this.output("(");
            this.visit_expr(expr.rest);
            this.output(")");
        }

        if (expr.not_op) {
            this.output(")");
        }
    }

    visit_call_expr(call_expr: CallExpr) {
        if (call_expr.namespace !== undefined) {
            call_expr.fun_name.lexeme = call_expr.namespace.lexeme + "_" + call_expr.fun_name.lexeme;
        }
        this.output(call_expr.fun_name.lexeme);
        this.output("(");
        this.print_with_commans(call_expr.args);
        this.output(")");
    }

    visit_data_type(data_type: DataType) {
        if (data_type.is_array) {
            this.output("array ");
        }
        this.output(data_type.type_name.lexeme);
    }

    visit_new_rvalue(new_rvalue: NewRValue) {
        this.output("new ");
        this.output(new_rvalue.type_name.lexeme);
        if (new_rvalue.struct_params !== undefined) {
            this.output("(");
            this.print_with_commans(new_rvalue.struct_params);
            this.output(")");
        } else if (new_rvalue.array_expr !== undefined) {
            this.output("[");
            new_rvalue.array_expr.accept(this);
            this.output("]");
        } else {
            throw new Error("Print Error: Unexpected error (1)");
        }
    }

    visit_delete_stmt(delete_stmt: DeleteStmt) {
        this.output("delete ");
        delete_stmt.var_rvalue.accept(this);
        this.output(";");
    }

    visit_fun_def(fun_def: FunDef) {
        this.output('function ');
        fun_def.return_type.accept(this);
        this.output(' ' + fun_def.fun_name.lexeme + '(');
        this.print_with_commans(fun_def.params);
        this.output(') {\n');
        this.indent += 1;
        this.print_stmts(fun_def.stmts);
        this.indent -= 1;
        this.output('}\n');
    }
}

