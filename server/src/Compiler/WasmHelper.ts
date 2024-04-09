import { DataType, Token, TokenType } from "./types";
import * as ast from "./types";

export const BUILT_INS = [
    'print', 'input', 'itos', 'itod', 'dtos', 'dtoi', 'stoi', 'stod',
    'length', 'get',
    'allocate_memory', 'mem_copy', 'get_array_pointer', 'array_int_to_string', 'string_to_array_int',
    'error', 'deallocate_memory', 'delete_i32_array', 'delete_string', 'i32_load', 'i32_store', 'delete_struct',
    'sleep', 'random'
]

const token_to_op: { [key: number]: string | Object } = {};
token_to_op[TokenType.PLUS] = ".add";
token_to_op[TokenType.MINUS] = ".sub";
token_to_op[TokenType.TIMES] = ".mul";
token_to_op[TokenType.DIVIDE] = {
    "i32": ".div_s",
    "f64": ".div"
};

token_to_op[TokenType.EQUAL] = ".eq";
token_to_op[TokenType.LESS_EQ] = {
    "i32": ".le_s",
    "f64": ".le"
};


token_to_op[TokenType.LESS] = {
    "i32": ".lt_s",
    "f64": ".lt"
};

token_to_op[TokenType.GREATER_EQ] = {
    "i32": ".ge_s",
    "f64": ".ge"
};

token_to_op[TokenType.GREATER] = {
    "i32": ".gt_s",
    "f64": ".gt"
};


token_to_op[TokenType.AND] = ".and";
token_to_op[TokenType.NOT_EQUAL] = ".ne";
token_to_op[TokenType.OR] = ".or";
token_to_op[TokenType.MOD] = {
    "i32": ".rem_s",
};

const mapped_functions = {
    "mem_copy": "memory.copy",
    "i32_load": "i32.load",
    "i32_store": "i32.store"
}

export function getMappedFunctions(name: string) {
    if (name in mapped_functions) {
        return mapped_functions[name]
    }
    return undefined
}


export function getPrintFunction(data_type: DataType) {
    //   # print(data_type)
    //   # print(data_type.type_name == TokenType.BOOL_TYPE)
    const type_name = data_type.type_name.token_type

    if (data_type.is_array) {
        return "print_int";
    }
    else if ([TokenType.BOOL_TYPE, TokenType.BOOL_VAL].includes(type_name)) {
        return "print_bool"
    }
    else if ([TokenType.INT_TYPE, TokenType.INT_VAL].includes(type_name)) {
        return "print_int"
    }
    else if ([TokenType.DOUBLE_TYPE, TokenType.DOUBLE_VAL].includes(type_name)) {
        return "print_double"
    }
    else if ([TokenType.STRING_TYPE, TokenType.STRING_VAL].includes(type_name)) {
        return "print_string"
    }
}

export function getLengthFunction(data_type: DataType) {
    const type_name = data_type.type_name.token_type

    if ([TokenType.STRING_TYPE, TokenType.STRING_VAL].includes(type_name)) {
        return "length_string";
    }

    return "length";
}

export function getWASMType(type_name: Token, is_array: boolean) {
    if (is_array) {
        return "i32";
    }

    if ([
        TokenType.ID,
        TokenType.VOID_TYPE,
        TokenType.NULL_VAL,
        TokenType.STRING_TYPE,
        TokenType.STRING_VAL,
    ].includes(type_name.token_type)) {
        return "i32"
    }

    if ([TokenType.DOUBLE_TYPE, TokenType.DOUBLE_VAL].includes(type_name.token_type)) {
        return "f64"
    }

    if (type_name.lexeme == "int" ||
        type_name.lexeme == "bool" ||
        type_name.token_type == TokenType.INT_VAL ||
        type_name.token_type == TokenType.BOOL_VAL) {

        return "i32"
    }

    throw Error("Type not recognized");
}

export function getWASMSize(data_type: DataType) {
    if ([
        TokenType.INT_TYPE,
        TokenType.INT_VAL,
        TokenType.ID,
        TokenType.STRING_TYPE,
        TokenType.STRING_VAL,
    ].includes(data_type.type_name.token_type)) {
        return 4
    }

    if ([
        TokenType.DOUBLE_TYPE,
        TokenType.DOUBLE_VAL
    ].includes(data_type.type_name.token_type)) {
        return 8
    }

    return 0
}

export function getWASMValue(type_name: Token) {
    if (type_name.lexeme === "null") {
        return "0"
    }

    if (type_name.token_type === TokenType.BOOL_VAL) {
        if (type_name.lexeme === "true") {
            return "1"
        }
        else {
            return "0"
        }
    }

    return type_name.lexeme
}

export function getWASMOp(op: Token, type_name: Token) {
    const tmpOp = token_to_op[op.token_type]

    if (typeof tmpOp == "string") {
        return tmpOp;
    }
    else {
        return tmpOp[getWASMType(type_name, false)]
    }
}

function generate_array_functions(size: number, wasm_type_name: string) {
    return `
  (func \$${wasm_type_name}_set_array_elem (param $value ${wasm_type_name}) (param $index i32) (param $arr i32) 
    local.get $arr
    call $check_if_null
    local.get $index
    call $check_in_bounds
    
    local.get $index
    i32.const ${size}
    i32.mul
    local.get $arr
    i32.add
    local.get $value
    ${wasm_type_name}.store
  )

  (func \$${wasm_type_name}_set_array_elem_alt (param $value ${wasm_type_name}) (param $arr i32) (param $index i32)   
    local.get $value
    local.get $index
    local.get $arr
    call $check_if_null
    call \$${wasm_type_name}_set_array_elem
  )
  
  (func \$${wasm_type_name}_get_array_elem (param $index i32) (param $arr i32) (result ${wasm_type_name})
    local.get $arr
    local.get $index
    call $check_in_bounds
    
    local.get $index
    i32.const ${size}
    i32.mul
    local.get $arr
    i32.add
    ${wasm_type_name}.load
    return
  )
  
  (func \$${wasm_type_name}_get_array_elem_alt (param $arr i32) (param $index i32) (result ${wasm_type_name})
    local.get $index
    local.get $arr
    call \$${wasm_type_name}_get_array_elem
  )
  
  (func \$${wasm_type_name}_new_array (param $size i32) (result i32)
   (local $index i32)
    local.get $size
    i32.const ${size}
    i32.mul
    i32.const 4
    i32.add
    call $allocate_memory
    i32.const 4
    i32.add
    local.set $index

    local.get $index
    i32.const 4
    i32.sub
    local.get $size
    i32.store

    local.get $index
    return
  )`;
}


function generate_struct_functions(size: number, wasm_type: string) {
    return `
  (func \$${wasm_type}_assign_to_struct (param $value ${wasm_type}) (param $struct i32) (param $index i32)
    local.get $struct
    call $check_if_null
    local.get $index
    i32.add

    local.get $value
    ${wasm_type}.store
  )`
}

function generatePrintFunctions() {
    return `
  (func $print_bool (param $print_bool0_value i32)

    local.get $print_bool0_value
    i32.const 0
    i32.eq
    if
      i32.const 5
      call $string_ini
      i32.const 0
      i32.const 102
      call $string_ini_assign
      i32.const 1
      i32.const 97
      call $string_ini_assign
      i32.const 2
      i32.const 108
      call $string_ini_assign
      i32.const 3
      i32.const 115
      call $string_ini_assign
      i32.const 4
      i32.const 101
      call $string_ini_assign
      call $print_string
    else
      i32.const 4
      call $string_ini
      i32.const 0
      i32.const 116
      call $string_ini_assign
      i32.const 1
      i32.const 114
      call $string_ini_assign
      i32.const 2
      i32.const 117
      call $string_ini_assign
      i32.const 3
      i32.const 101
      call $string_ini_assign
      call $print_string
    end
    i32.const 0
    return
  )

  (func $print_int (param $print_int0_value i32)
    (local $tmpString i32)
    local.get $print_int0_value
    
    call $itos
    local.tee $tmpString
    
    call $print
    
    local.get $tmpString
    call $delete_string
  )

  (func $print_double (param $print_double0_value f64)
    (local $tmpString i32)
    local.get $print_double0_value
    
    call $dtos
    local.tee $tmpString
    
    call $print
    
    local.get $tmpString
    call $delete_string
  )

  (func $print_string (param $print_string0_value i32)
    local.get $print_string0_value
    call $print
    local.get $print_string0_value
    call $delete_string
  )`
}

export function getWASMCoreFunctions(){
    return `(func $print (import "env" "print") (param i32))
  (func $input (import "env" "input") (result i32))
  (func $sleep (import "env" "sleep") (param i32))
  (func $random (import "env" "random") (result f64))
  (func $allocate_memory (import "env" "allocate_memory") (param i32) (result i32))
  (func $deallocate_memory (import "env" "deallocate_memory") (param i32) (param i32))
  (export "string_ini" (func $string_ini))
  (export "string_ini_assign" (func $string_ini_assign))
  (global $mem (mut i32) (i32.const 0))
  (global $tmp (mut i32) (i32.const 0))
;; (data (i32.const 4) "f\0\0\0e\0")
;;  (func $allocate_memory (param $size i32) (result i32)
;;     (local $tmpOffset i32)
    
;;     global.get $offset
;;     local.set $tmpOffset
    
;;     global.get $offset
;;     local.get $size
;;     i32.add
;;     global.set $offset
    
;;     local.get $tmpOffset
;;   )

  (func $check_in_bounds (param $arr i32) (param $index i32)
    local.get $index
    i32.const 0
    i32.lt_s
    local.get $index
    local.get $arr
    call $length
    i32.ge_s
    i32.or
    if
      unreachable
    end
  )
  
  
  (func $check_if_null (param $struct i32) (result i32)
    local.get $struct
    i32.eqz
    if
      unreachable
    end
    
    local.get $struct
    return
  )

  (func $itod (param $num i32) (result f64)
    local.get $num
    f64.convert_i32_s
    return
  )
  
  (func $dtoi (param $num f64) (result i32)
    local.get $num
    i32.trunc_f64_s
    return
  )
  
  (func $length (param $arr i32) (result i32)
    local.get $arr
    i32.const 4
    i32.sub
    i32.load
  )
  
  (func $length_string (param $arr i32) (result i32)
    (local $tmpLength i32)
    
    local.get $arr
    call $length
    local.set $tmpLength
    
    local.get $arr
    call $delete_string
    
    local.get $tmpLength
  )
  
  (func $error (param $str_array i32)
    unreachable
  )
  
  (func $get_array_pointer (param $arr i32) (result i32)
    local.get $arr
  )
  
  (func $array_int_to_string (param $arr i32) (result i32)
    local.get $arr
  )
  
  (func $string_to_array_int (param $arr i32) (result i32)
    local.get $arr
  )
  
  (func $delete_i32_array (param $delete_i32_array0_arr i32)
    local.get $delete_i32_array0_arr
    call $get_array_pointer
    i32.const 4
    i32.sub
    i32.const 4
    local.get $delete_i32_array0_arr
    call $length
    i32.const 1
    i32.add
    i32.mul
    call $deallocate_memory
    i32.const 0
    return
  )

  (func $delete_string (param $delete_string0_str i32)
    local.get $delete_string0_str
    call $delete_i32_array
  )
  
  (func $string_ini_assign (param $array i32) (param $index i32) (param $value i32) (result i32)    
    local.get $array
    local.get $index
    i32.const 4
    i32.mul
    i32.add
    local.get $value
    i32.store

    local.get $array
    return
  )

  (func $string_ini (param $length i32) (result i32)
    (local $totalBytes i32)
    (local $tmpOffset i32)

    i32.const 4
    i32.const 4
    local.get $length
    i32.mul
    i32.add
    local.set $totalBytes

    local.get $totalBytes
    call $allocate_memory
    local.set $tmpOffset

    local.get $tmpOffset
    local.get $length
    i32.store

    local.get $tmpOffset
    i32.const 4
    i32.add
    
    return
  )
  
  (func $copy_string (param $copy_string0_str i32) (result i32)
   (local $copy_string0_str_length i32)
   (local $copy_string0_tmpOffset i32)

    local.get $copy_string0_str
    call $length
    local.set $copy_string0_str_length

    local.get $copy_string0_str_length
    i32.const 4
    i32.mul
    i32.const 4
    i32.add
    call $allocate_memory
    local.set $copy_string0_tmpOffset

    local.get $copy_string0_tmpOffset
    local.get $copy_string0_str
    call $get_array_pointer
    i32.const 4
    i32.sub
    local.get $copy_string0_str_length
    i32.const 4
    i32.mul
    i32.const 4
    i32.add
    memory.copy

    local.get $copy_string0_tmpOffset
    i32.const 4
    i32.add
    return
    i32.const 0
    return
  )

  (func $string_concat (param $string_concat0_string_1 i32) (param $string_concat0_string_2 i32) (result i32)
   (local $string_concat0_length_1 i32)
   (local $string_concat0_length_2 i32)
   (local $string_concat0_new_length i32)
   (local $string_concat0_new_string i32)

    local.get $string_concat0_string_1
    call $length
    local.set $string_concat0_length_1

    local.get $string_concat0_string_2
    call $length
    local.set $string_concat0_length_2

    local.get $string_concat0_length_1
    local.get $string_concat0_length_2
    i32.add
    local.set $string_concat0_new_length

    local.get $string_concat0_new_length
    call $string_ini
    local.set $string_concat0_new_string

    local.get $string_concat0_new_string
    local.get $string_concat0_string_1
    local.get $string_concat0_length_1
    i32.const 4
    i32.mul
    memory.copy

    local.get $string_concat0_new_string
    local.get $string_concat0_length_1
    i32.const 4
    i32.mul
    i32.add
    local.get $string_concat0_string_2
    local.get $string_concat0_length_2
    i32.const 4
    i32.mul
    memory.copy

    local.get $string_concat0_string_1
    i32.const 4
    i32.sub
    local.get $string_concat0_length_1
    i32.const 4
    i32.mul
    i32.const 4
    i32.add
    call $deallocate_memory

    local.get $string_concat0_string_2
    i32.const 4
    i32.sub
    local.get $string_concat0_length_2
    i32.const 4
    i32.mul
    i32.const 4
    i32.add
    call $deallocate_memory

    local.get $string_concat0_new_string
    return
    i32.const 0
    return
  )
  
  (func $itos (param $itos_0_val i32) (result i32)
   (local $size i32)
   (local $val i32)
   (local $result i32)
   (local $i i32)

    i32.const 0
    local.set $size

    local.get $itos_0_val
    local.set $val

    (loop $loop1
      local.get $val
      i32.const 10
      i32.div_s
      local.set $val
      local.get $size
      i32.const 1
      i32.add
      local.set $size
      local.get $val
      i32.const 0
      i32.gt_s
      br_if $loop1
    )

    local.get $itos_0_val
    local.set $val

    local.get $size
    call $i32_new_array
    local.set $result

    local.get $size
    i32.const 1
    i32.sub
    local.set $i
    (loop $loop2
      i32.const 48
      local.get $val
      i32.const 10
      i32.rem_s
      i32.add
      local.get $i
      local.get $result
      call $i32_set_array_elem
      local.get $val
      i32.const 10
      i32.div_s
      local.set $val
      local.get $i
      i32.const 1
      i32.sub
      local.set $i
      local.get $i
      i32.const 0
      i32.ge_s
      br_if $loop2
    )

    local.get $result
    return
  )
  
  
  (func $dtos (param $dtos_0_d f64) (result i32)
   (local $dtos_0_precision i32)
   (local $dtos_0_total_length i32)
   (local $dtos_0_is_neg i32)
   (local $dtos_0_int_part i32)
   (local $dtos_0_int_length i32)
   (local $dtos_0_offset i32)
   (local $dtos_0_fract_part f64)
   (local $dtos_0_result i32)
   (local $dtos__for1_i i32)
   (local $dtos__for2_i i32)
   (local $dtos__for2_digit i32)
   (local $tmpString i32)

    i32.const 10
    local.set $dtos_0_precision

    local.get $dtos_0_precision
    i32.const 1
    i32.add
    local.set $dtos_0_total_length

    local.get $dtos_0_d
    f64.const 0.0
    f64.lt
    local.set $dtos_0_is_neg

    local.get $dtos_0_is_neg
    if
      local.get $dtos_0_total_length
      i32.const 1
      i32.add
      local.set $dtos_0_total_length
      local.get $dtos_0_d
      f64.const 0.0
      f64.const 1.0
      f64.sub
      f64.mul
      local.set $dtos_0_d
    end

    local.get $dtos_0_d
    call $dtoi
    call $itos
    local.tee $tmpString
    call $string_to_array_int
    local.set $dtos_0_int_part

    local.get $dtos_0_int_part
    call $length
    local.set $dtos_0_int_length

    i32.const 0
    local.set $dtos_0_offset

    local.get $dtos_0_total_length
    local.get $dtos_0_int_length
    i32.add
    local.set $dtos_0_total_length

    local.get $dtos_0_d
    local.get $dtos_0_d
    call $dtoi
    call $itod
    f64.sub
    local.set $dtos_0_fract_part

    local.get $dtos_0_total_length
    call $i32_new_array
    local.set $dtos_0_result

    local.get $dtos_0_is_neg
    if
      i32.const 45
      local.get $dtos_0_offset
      local.get $dtos_0_result
      call $i32_set_array_elem
      local.get $dtos_0_offset
      i32.const 1
      i32.add
      local.set $dtos_0_offset
    end

    i32.const 0
    local.set $dtos__for1_i
    (loop $loop1
      local.get $dtos__for1_i
      local.get $dtos_0_int_part
      call $i32_get_array_elem
      local.get $dtos_0_offset
      local.get $dtos_0_result
      call $i32_set_array_elem
      local.get $dtos_0_offset
      i32.const 1
      i32.add
      local.set $dtos_0_offset
      local.get $dtos__for1_i
      i32.const 1
      i32.add
      local.set $dtos__for1_i
      local.get $dtos__for1_i
      local.get $dtos_0_int_length
      i32.lt_s
      br_if $loop1
    )

    i32.const 46
    local.get $dtos_0_offset
    local.get $dtos_0_result
    call $i32_set_array_elem

    local.get $dtos_0_offset
    i32.const 1
    i32.add
    local.set $dtos_0_offset

    i32.const 0
    local.set $dtos__for2_i
    (loop $loop2
      local.get $dtos_0_fract_part
      f64.const 10.0
      f64.mul
      local.set $dtos_0_fract_part
      local.get $dtos_0_fract_part
      call $dtoi
      local.set $dtos__for2_digit
      i32.const 48
      local.get $dtos__for2_digit
      i32.add
      local.get $dtos_0_offset
      local.get $dtos_0_result
      call $i32_set_array_elem
      local.get $dtos_0_fract_part
      local.get $dtos__for2_digit
      call $itod
      f64.sub
      local.set $dtos_0_fract_part
      local.get $dtos_0_offset
      i32.const 1
      i32.add
      local.set $dtos_0_offset
      local.get $dtos__for2_i
      i32.const 1
      i32.add
      local.set $dtos__for2_i
      local.get $dtos__for2_i
      local.get $dtos_0_precision
      i32.lt_s
      br_if $loop2
    )

    local.get $tmpString
    call $delete_string

    local.get $dtos_0_result
    call $array_int_to_string
    return
    i32.const 0
    return
  )
  
  (func $stod (param $stod_0_str i32) (result f64)
   (local $stod_0_int_arr i32)
   (local $stod_0_is_neg i32)
   (local $stod_0_found_decimal i32)
   (local $stod_0_decimal_coeff f64)
   (local $stod_0_d f64)
   (local $stod__for1_i i32)

    local.get $stod_0_str
    call $string_to_array_int
    local.set $stod_0_int_arr

    i32.const 0
    local.set $stod_0_is_neg

    i32.const 0
    local.set $stod_0_found_decimal

    f64.const 10.0
    local.set $stod_0_decimal_coeff

    f64.const 0.0
    local.set $stod_0_d

    i32.const 0
    local.set $stod__for1_i
    (loop $loop1
      local.get $stod__for1_i
      local.get $stod_0_int_arr
      call $i32_get_array_elem
      i32.const 45
      i32.eq
      if
        local.get $stod__for1_i
        i32.const 0
        i32.ne
        if
          i32.const 0
          call $string_ini
          call $error
        else
          i32.const 1
          local.set $stod_0_is_neg
        end
      else
        local.get $stod__for1_i
        local.get $stod_0_int_arr
        call $i32_get_array_elem
        i32.const 48
        i32.ge_s
        local.get $stod__for1_i
        local.get $stod_0_int_arr
        call $i32_get_array_elem
        i32.const 57
        i32.le_s
        i32.and
        if
          local.get $stod_0_found_decimal
          if
            local.get $stod_0_d
            local.get $stod__for1_i
            local.get $stod_0_int_arr
            call $i32_get_array_elem
            i32.const 48
            i32.sub
            call $itod
            local.get $stod_0_decimal_coeff
            f64.div
            f64.add
            local.set $stod_0_d
            local.get $stod_0_decimal_coeff
            f64.const 10.0
            f64.mul
            local.set $stod_0_decimal_coeff
          else
            local.get $stod_0_d
            f64.const 10.0
            f64.mul
            local.get $stod__for1_i
            local.get $stod_0_int_arr
            call $i32_get_array_elem
            i32.const 48
            i32.sub
            call $itod
            f64.add
            local.set $stod_0_d
          end
        else
          local.get $stod__for1_i
          local.get $stod_0_int_arr
          call $i32_get_array_elem
          i32.const 46
          i32.eq
          if
            local.get $stod_0_found_decimal
            if
              i32.const 0
              call $string_ini
              call $error
            else
              i32.const 1
              local.set $stod_0_found_decimal
            end
          else
            i32.const 0
            call $string_ini
            call $error
          end
        end
      end
      local.get $stod__for1_i
      i32.const 1
      i32.add
      local.set $stod__for1_i
      local.get $stod__for1_i
      local.get $stod_0_int_arr
      call $length
      i32.lt_s
      br_if $loop1
    )

    local.get $stod_0_is_neg
    if
      local.get $stod_0_d
      f64.const 0.0
      f64.const 1.0
      f64.sub
      f64.mul
      local.set $stod_0_d
    end

    local.get $stod_0_d
    return
    f64.const 0
    return
  )
  
  (func $stoi (param $stoi_0_str i32) (result i32)
    local.get $stoi_0_str
    call $stod
    call $dtoi
    return
  )

  (func $get (param $get_0_index i32) (param $get_0_str i32) (result i32)
   (local $get_0_arr_int i32)
   (local $get_0_result_int i32)

    local.get $get_0_str
    call $string_to_array_int
    local.set $get_0_arr_int

    i32.const 1
    call $i32_new_array
    local.set $get_0_result_int

    local.get $get_0_index
    local.get $get_0_arr_int
    call $i32_get_array_elem
    i32.const 0
    local.get $get_0_result_int
    call $i32_set_array_elem

    local.get $get_0_result_int
    call $array_int_to_string
    return
    i32.const 0
    return
  )
  
  (func $delete_struct (param $delete_struct0_struct_pointer i32)
   (local $delete_struct0_length i32)

    local.get $delete_struct0_struct_pointer
    i32.const 4
    i32.sub
    i32.load
    local.set $delete_struct0_length

    local.get $delete_struct0_struct_pointer
    i32.const 4
    i32.sub
    local.get $delete_struct0_length
    i32.const 4
    i32.add
    call $deallocate_memory
    i32.const 0
    return
  )

  ${generatePrintFunctions()}
  ${generate_array_functions(4, "i32")}
  ${generate_array_functions(4, "f32")}
  ${generate_array_functions(8, "f64")}
  (func $allocate_struct (param $size i32) (result i32)
    (local $tmpOffset i32)
    local.get $size
    i32.const 4
    i32.add
    call $allocate_memory
    local.tee $tmpOffset
    
    local.get $size
    i32.store
    
    local.get $tmpOffset
    i32.const 4
    i32.add
  )
  ${generate_struct_functions(4, "i32")}
  ${generate_struct_functions(8, "f64")}
`
}


export const DATA_TYPES = {
  "void": new ast.DataType(false, ast.Token(ast.TokenType.VOID_TYPE, "void", 0, 0), undefined),
  "string": new ast.DataType(false, ast.Token(ast.TokenType.STRING_TYPE, "string", 0, 0), undefined),
  "int": new ast.DataType(false, ast.Token(ast.TokenType.INT_TYPE, "int", 0, 0), undefined),
  "double": new ast.DataType(false, ast.Token(ast.TokenType.DOUBLE_TYPE, "double", 0, 0), undefined),
  "bool": new ast.DataType(false, ast.Token(ast.TokenType.BOOL_TYPE, "bool", 0, 0), undefined),
  "array_int": new ast.DataType(true, ast.Token(ast.TokenType.INT_TYPE, "int", 0, 0), undefined),
  "ANY_ARRAY": new ast.DataType(true, ast.Token(ast.TokenType.ID, "any", 0, 0), undefined),
  "ANY_STRUCT": new ast.DataType(true, ast.Token(ast.TokenType.ID, "any_struct", 0, 0), undefined),
};

// export const BUILT_IN_DEFINITION = 