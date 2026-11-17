'use strict';
// Read the password through stdin, never command-line arguments or a file.
const crypto=require('crypto');let input='';
process.stdin.setEncoding('utf8');
process.stdin.on('data',chunk=>{input+=chunk;if(input.length>4096){process.stderr.write('Password too long.');process.exit(1);}});
process.stdin.on('end',()=>{
  const password=input.replace(/\r?\n$/,'');
  if(password.length<16){process.stderr.write('Use at least 16 characters.');process.exitCode=1;return;}
  const salt=crypto.randomBytes(16).toString('hex');
  process.stdout.write('scrypt:'+salt+':'+crypto.scryptSync(password,salt,32).toString('hex'));
  input='';
});
