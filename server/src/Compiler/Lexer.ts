import { StringBuffer } from "./StringBuffer";
import { ErrorType, MyWASMError, Token, TokenType } from "./types";
import { EOL } from "node:os";

const single_char_map = {
    ".": TokenType.DOT,
    ";": TokenType.SEMICOLON,
    ",": TokenType.COMMA,
    "+": TokenType.PLUS,
    "%": TokenType.MOD,
    "-": TokenType.MINUS,
    "*": TokenType.TIMES,
    "(": TokenType.LPAREN,
    ")": TokenType.RPAREN,
    "[": TokenType.LBRACKET,
    "]": TokenType.RBRACKET,
    "{": TokenType.LBRACE,
    "}": TokenType.RBRACE,
}

const ambiguous_char_map = {
    ">=": TokenType.GREATER_EQ,
    ">": TokenType.GREATER,
    "<=": TokenType.LESS_EQ,
    "<": TokenType.LESS,
    "==": TokenType.EQUAL,
    "=": TokenType.ASSIGN,
    "!=": TokenType.NOT_EQUAL,
};

const ambiguous_start_chars = new Set([">", "<", "=", "!"]);

const multi_char_map = {
    "null": TokenType.NULL_VAL,
    "true": TokenType.BOOL_VAL,
    "false": TokenType.BOOL_VAL,
    "int": TokenType.INT_TYPE,
    "double": TokenType.DOUBLE_TYPE,
    "string": TokenType.STRING_TYPE,
    "bool": TokenType.BOOL_TYPE,
    "void": TokenType.VOID_TYPE,
    "and": TokenType.AND,
    "or": TokenType.OR,
    "not": TokenType.NOT,
    "if": TokenType.IF,
    "elseif": TokenType.ELSEIF,
    "else": TokenType.ELSE,
    "while": TokenType.WHILE,
    "for": TokenType.FOR,
    "return": TokenType.RETURN,
    "struct": TokenType.STRUCT,
    "array": TokenType.ARRAY,
    "new": TokenType.NEW,
    "function": TokenType.FUNCTION,
    "import": TokenType.IMPORT,
    "as": TokenType.AS,
    "delete": TokenType.DELETE,
    "export": TokenType.EXPORT
}


export class Lexer {
    column: number = 1;
    line: number = 1;
    in_stream: StringBuffer;
    lexeme: string = "";
    token_type: TokenType | undefined

    constructor(in_stream: StringBuffer){
        /** Create a Lexer over the given input stream.

        Args:
            in_stream -- The input stream. 

        **/ 

        this.in_stream = in_stream
    }

    read(): string {
        this.column += 1;
        return this.in_stream.read_char();
    }

    peek(): string {
        return this.in_stream.peek_char()
    }

    eof(ch: string): boolean {
        return ch === undefined;
    }

    isNumeric(char: string) {
        const charCode = char.charCodeAt(0);
        return charCode >= 48 && charCode <= 57;
    }

    isAlpha(char: string) {
        const charCode = char.charCodeAt(0);
        return (charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122);
    }

    isSpace(char: string) {
        return char == " " || char == EOL || char == "\t" || char == "\r" || char == "\n";
    }

    is_valid_id(ch: string) {
        return this.isAlpha(ch) || ch == "_" || this.isNumeric(ch);
    }

    error(message: string, line: number, column: number) {
        const lexerError = new Error(message) as MyWASMError;
        
        lexerError.line = line;
        lexerError.column = column;
        lexerError.type = "Lexer";

        throw lexerError;
    }

    handle_whitespaces() {
        this.lexeme = this.peek();

        while (this.isSpace(this.lexeme)) {
            // Since we know that the character is
            // a whitespace, we can eliminate it
            this.read();

            // If it's a new line, we must reset the 
            // column number and increment column number
            if (this.lexeme == EOL) {
                this.column = 0;
                this.line += 1;
            }

            this.lexeme = this.peek();
        }

        this.lexeme = this.read();
    }

    handle_comments() {
        // if the next char is also /,
        // then it is actually a comment
        let nextCh: string;

        if (this.peek() == "/") {
            this.lexeme = "";
            this.token_type = TokenType.COMMENT;

            // remove the next / that's part of 
            // the comment
            this.read()

            nextCh = this.peek()

            // Since we don't support multiline comments
            // we should stop when we read a newline or EOF
            while (nextCh != EOL && !this.eof(nextCh)) {
                this.read()
                this.lexeme += nextCh;
                nextCh = this.peek();
            }
        }
        else {
            this.token_type = TokenType.DIVIDE;
        }
    }

    handle_strings() {
        let nextCh = this.peek()

        this.token_type = TokenType.STRING_VAL;
        this.lexeme = ""

        while (nextCh != "\"" && !this.eof(nextCh) && nextCh != EOL) {
            this.read()
            this.lexeme += nextCh;
            nextCh = this.peek();
        }

        if (nextCh == "\"") {
            this.read()
        }
        else {
            this.error("String wasn't terminated", this.line, this.column)
        }
    }

    handle_ambiguous_tokens(this) {
        let tempLexeme = this.lexeme;

        switch (tempLexeme) {
            case "=":
                if (this.peek() == "=") {
                    tempLexeme += this.read()
                }

                break;
            case "!":
                if (this.peek() == "=") {
                    tempLexeme += this.read();
                }
                else {
                    this.error(`Unexpected token '!'`, this.line, this.column);
                }

                break;
            case ">":
                if (this.peek() == "=") {
                    tempLexeme += this.read()
                }

                break;
            case "<":
                if (this.peek() == "=") {
                    tempLexeme += this.read()
                }
                break;

        }

        if (tempLexeme in ambiguous_char_map) {
            this.token_type = ambiguous_char_map[tempLexeme];
            this.lexeme = tempLexeme;
        }
    }

    handle_numeric_literals() {
        let nextCh = this.peek();
        this.token_type = TokenType.INT_VAL;
        let isDouble = nextCh == ".";

        // if it is a double, then eliminate the 
        // decimal point, and add it to the lexeme
        if (isDouble) {
            this.lexeme += this.read()
            nextCh = this.peek();
        }

        while (this.isNumeric(nextCh) && !this.eof(nextCh)) {
            this.read()
            this.lexeme += nextCh;
            nextCh = this.peek();


            if (nextCh == ".") {
                // Making sure doubles can't have multiple
                // decimal points
                if (isDouble) {
                    this.error("Doubles can't have multiple decimal points", this.line, this.column)
                }

                isDouble = true
                this.lexeme += this.read()
                nextCh = this.peek();
            }
        }

        if (this.lexeme[-1] == ".") {
            this.error("Doubles must have at least one decimal digit", this.line, this.column)
        }
        else if (this.lexeme.length > 1 && this.lexeme[0] == "0" && !isDouble) {
            this.error("Ints can't have leading 0s", this.line, this.column);
        }
        else if (isDouble && this.lexeme[0] == "0" && this.lexeme[1] != ".") {
            this.error("Doubles can't have leading 0s", this.line, this.column);
        }

        if (isDouble) {
            this.token_type = TokenType.DOUBLE_VAL;
        }
    }

    handle_keywords_ids() {
        let nextCh = this.peek();

        if (!this.isAlpha(this.lexeme)) {
            this.error(`IDs can't begin with '${this.lexeme}'`, this.line, this.column);
        }

        while (this.is_valid_id(nextCh)) {
            this.read()
            this.lexeme += nextCh;
            nextCh = this.peek();
        }


        if (this.lexeme in multi_char_map){
            this.token_type = multi_char_map[this.lexeme];
        }
        else if (this.lexeme.length == 1 && !this.is_valid_id(this.lexeme)) {
            this.error(`Unexpected token '${this.lexeme}'`, this.line, this.column);
        }
        else {
            this.token_type = TokenType.ID
        }
    }

    next_token() {
        // Return the next token in the lexer's input stream.

        // Getting rid of whitespaces
        this.handle_whitespaces();

        // These must be assigned after eliminating 
        // the whitespace, to make sure the 
        // the line/column number is right
        const ini_column = this.column;
        const ini_line = this.line;

        this.token_type = undefined;

        if(this.lexeme === undefined) {
            this.lexeme = ""
            this.token_type = TokenType.EOS;
        }
        else if (this.lexeme in single_char_map) {
            // These include tokens that can be directly mapped
            // by just looking at one character (which includes 
            // some operators and punctuations)

            this.token_type = single_char_map[this.lexeme];
        }
        else if (this.isNumeric(this.lexeme)) {
            // Numeric tokens (int / Double)

            this.handle_numeric_literals();
        }
        else if (this.lexeme == "/") {
            // Potentially a comment or a divide symbol

            this.handle_comments();
        }
        else if (this.lexeme == "\"") {
            // This will thrown an error if the string
            // wasn't terminated

            this.handle_strings();
        }
        else if (ambiguous_start_chars.has(this.lexeme)) {
            // Checking if it is an ambiguous token
            // This will throw an error if there's
            // a stray "!"

            this.handle_ambiguous_tokens();
        }
        else if (this.lexeme == ":") {
            if (this.read() == ":") {
                this.lexeme = ":"
                this.token_type = TokenType.SCOPE_RESOLUTION
            }
            else {
                this.error("Was expecting the scope resolution operator", this.line, this.column)
            }
        }
        else {
            // If it's none of the things above, then it must 
            // belong to multiCharMap or it's an identifier

            this.handle_keywords_ids();
        }

        // If the token_type isn't set, then it must mean
        // something went wrong
        if (this.token_type === undefined){
            this.error(`Unexpected error`, this.line, this.column);
        }

        return Token(this.token_type, this.lexeme, ini_line, ini_column);
    }
}