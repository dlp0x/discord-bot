// src/utils/shared/generateErrorId.js  (NOUVEAU fichier)
export function generateErrorId() {
    return (
      Math.random().toString(36).substring(2, 15)
      + Math.random().toString(36).substring(2, 15)
    );
  }