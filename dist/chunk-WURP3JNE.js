// src/codes.ts
var ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
function randomCode(random = Math.random) {
  let code = "";
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.min(25, Math.floor(random() * 26))];
  return code;
}

export {
  randomCode
};
//# sourceMappingURL=chunk-WURP3JNE.js.map