/* Dashboard loading screen: shown from the first moment (never a white page). If neither the sign-in screen nor the
   dashboard has appeared after 10 seconds, it says the connection is slow and offers to try again. */
(function () {
  setTimeout(function () {
    var boot = document.getElementById("boot");
    if (!boot || getComputedStyle(boot).display === "none") return;
    boot.querySelector("p").textContent = "التحميل يتأخر — الاتصال بطيء أو منقطع.";
    var b = document.getElementById("bootRetry");
    b.hidden = false;
    b.onclick = function () { location.reload(); };
  }, 10000);
})();
