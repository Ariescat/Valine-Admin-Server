const AV = require("leanengine");
const mail = require("./utilities/send-mail");
const Comment = AV.Object.extend("Comment");
const axios = require("axios");
const spam = require("./utilities/check-spam");

function sendNotification(currentComment, defaultIp) {
  // 发送博主通知邮件
  if (currentComment.get("mail") !== process.env.TO_EMAIL) {
    mail.notice(currentComment);
  }

  const ip = currentComment.get("ip") || defaultIp;
  console.log("IP: %s", ip);
  spam.checkSpam(currentComment, ip);

  // AT评论通知
  const rid = currentComment.get("pid") || currentComment.get("rid");
  console.log("pid: %s", currentComment.get("pid"));
  console.log("rid: %s", currentComment.get("rid"));
  console.log("rid2: %s", rid);

  if (!rid) {
    console.log("这条评论没有 @ 任何人");
    return;
  } else if (currentComment.get("isSpam")) {
    console.log("评论未通过审核，通知邮件暂不发送");
    return;
  }

  const query = new AV.Query("Comment");
  query.get(rid).then(
    function (parentComment) {
      if (
        parentComment.get("mail") &&
        parentComment.get("mail") !== process.env.TO_EMAIL
      ) {
        mail.send(currentComment, parentComment);
      } else {
        console.log("被@者匿名，不会发送通知");
      }
    },
    function (error) {
      console.warn("获取@对象失败！");
    }
  );
}

AV.Cloud.afterSave("Comment", function (req) {
  const currentComment = req.object;
  // 检查垃圾评论
  return sendNotification(currentComment, req.meta.remoteAddress);
});

AV.Cloud.define("resend_mails", function (req) {
  const query = new AV.Query(Comment);
  query.greaterThanOrEqualTo(
    "createdAt",
    new Date(new Date().getTime() - 24 * 60 * 60 * 1000)
  );
  query.notEqualTo("isNotified", true);
  // 如果你的评论量很大，可以适当调高数量限制，最高1000
  query.limit(200);
  return query.find().then(function (results) {
    new Promise((resolve, reject) => {
      count = results.length;
      for (var i = 0; i < results.length; i++) {
        sendNotification(results[i], req.meta.remoteAddress);
      }
      resolve(count);
    })
      .then((count) => {
        console.log(`昨日${count}条未成功发送的通知邮件处理完毕！`);
      })
      .catch((error) => {
        console.error(`昨日未成功发送的通知邮件处理失败:`, error);
      });
  });
});

AV.Cloud.define("self_wake", function (req) {
  axios
    .get(process.env.ADMIN_URL)
    .then(function (response) {
      console.log(
        "自唤醒任务执行成功，响应状态码为:",
        response && response.status
      );
    })
    .catch(function (error) {
      console.error("自唤醒任务执行失败:", error);
    });
});
