import { DataType } from "./types";

export class SymbolTable {
    environments: { [key: string]: DataType }[] = [];

    get length() {
        return this.environments.length;
    }

    toString() {
        return this.environments.toString();
    }

    push_environment() {
        this.environments.push({});
    }

    pop_environment() {
        if (this.environments.length > 0) {
            this.environments.pop();
        }
    }

    add(name: string, info: DataType) {
        if (this.environments.length > 0) {
            this.environments[this.environments.length - 1][name] = info;
        }
    }

    delete(name: string) {
        if (this.environments.length > 0 && name in this.environments[this.environments.length - 1]) {
            delete this.environments[this.environments.length - 1][name];
        }
    }

    exists(name: string) {
        for (let i = 1; i <= this.length; i++) {
            if (name in this.environments[this.environments.length - i]) {
                return true;
            }
        }
        return false;
    }

    index_of_binded_env(name: string) {
        for (let i = 1; i <= this.length; i++) {
            if (name in this.environments[this.environments.length - i]) {
                return i;
            }
        }
        return -1;
    }

    get_var_prefix(name: string) {
        const index = this.index_of_binded_env(name);
        if (index === this.length) {
            return "global";
        } else {
            return "local";
        }
    }

    exists_in_global_env(name: string) {
        return this.environments.length > 0 && name in this.environments[0];
    }

    exists_in_curr_env(name: string) {
        return this.environments.length > 0 && name in this.environments[this.environments.length - 1];
    }

    get_current_env() {
        return this.environments[this.environments.length - 1];
    }

    get(name: string) {
        const n = this.length;
        for (let i = 1; i <= this.length; i++) {
            if (name in this.environments[this.environments.length - i]) {
                return this.environments[this.environments.length - i][name];
            }
        }
        return undefined;
    }
}

