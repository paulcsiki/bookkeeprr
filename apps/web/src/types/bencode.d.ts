declare module 'bencode' {
  type BencodeValue = Uint8Array | string | number | BencodeDict | BencodeList;
  interface BencodeDict {
    [key: string]: BencodeValue;
  }
  type BencodeList = BencodeValue[];

  const bencode: {
    encode(data: BencodeValue): Uint8Array;
    decode(data: Uint8Array | Buffer | string, encoding?: string): BencodeValue;
  };
  export default bencode;
}
