// Curseur personnalisé
const cursor = document.getElementById('cursor');
const cursorRing = document.getElementById('cursorRing');
let mouseX=0,mouseY=0,ringX=0,ringY=0;
document.addEventListener('mousemove',e=>{mouseX=e.clientX;mouseY=e.clientY;cursor.style.left=mouseX+'px';cursor.style.top=mouseY+'px'});
(function animRing(){ringX+=(mouseX-ringX)*.12;ringY+=(mouseY-ringY)*.12;cursorRing.style.left=ringX+'px';cursorRing.style.top=ringY+'px';requestAnimationFrame(animRing)})();
document.querySelectorAll('button,a,input,label').forEach(el=>{
  el.addEventListener('mouseenter',()=>{cursorRing.style.transform='translate(-50%,-50%) scale(1.5)';cursorRing.style.opacity='1'});
  el.addEventListener('mouseleave',()=>{cursorRing.style.transform='translate(-50%,-50%) scale(1)';cursorRing.style.opacity='.5'});
});

// Menu burger
const burger = document.getElementById('burger');
const menu = document.getElementById('dropdownMenu');
const overlay = document.getElementById('menuOverlay');
if(burger){
  burger.addEventListener('click', () => {
    menu.classList.toggle('open');
    overlay.classList.toggle('open');
  });
  overlay.addEventListener('click', () => {
    menu.classList.remove('open');
    overlay.classList.remove('open');
  });
}
