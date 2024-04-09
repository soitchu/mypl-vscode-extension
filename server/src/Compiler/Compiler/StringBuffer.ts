export class StringBuffer {
    stream: string;
    index = 0;

    constructor(stream: string){
        this.stream = stream;
    }

    read_char(){
        // Returns and removes a single character in stream.
        return this.stream[this.index++];
    }

    peek_char(){
        return this.stream[this.index];
    }

    close(){
        // @ts-ignore
        this.stream = undefined;
    }
}