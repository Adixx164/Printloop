import React from 'react';

function Test() {
  const condition = true;
  return (
    <div>
      {condition && (
        <span>Hello</span>
      )}
    </div>
  );
}
export default Test;