// Plain module — no "use client". Safe to import from Server Components.
export const THEME_STORAGE_KEY = "relay.theme";

export const noFlashScript = `(function(){try{
  var k="${THEME_STORAGE_KEY}";
  var p=localStorage.getItem(k);
  if(p!=="light"&&p!=="dark"&&p!=="system")p="system";
  var d=p==="system"?(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;
  document.documentElement.setAttribute("data-theme",d);
  document.documentElement.style.colorScheme=d;
}catch(e){}})();`;
