"use strict";
const nodemailer = require("nodemailer");
const ejs = require("ejs");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const $ = require("cheerio");

const config = {
  auth: {
    user: process.env.SMTP_ACCOUNT,
    pass: process.env.SMTP_PASS,
  },
};

if (process.env.SMTP_SERVICE != null) {
  config.service = process.env.SMTP_SERVICE;
} else {
  config.host = process.env.SMTP_HOST;
  config.port = parseInt(process.env.SMTP_PORT);
  config.secure = process.env.SMTP_SECURE !== "false";
}

const transporter = nodemailer.createTransport(config);
const templateName = process.env.TEMPLATE_NAME
  ? process.env.TEMPLATE_NAME
  : "rainbow";
const noticeTemplate = ejs.compile(
  fs.readFileSync(
    path.resolve(process.cwd(), "template", templateName, "notice.ejs"),
    "utf8"
  )
);
const sendTemplate = ejs.compile(
  fs.readFileSync(
    path.resolve(process.cwd(), "template", templateName, "send.ejs"),
    "utf8"
  )
);
// 该方法验证 SMTP 是否配置正确
console.log('SMTP邮箱校验开始 user:%s,pass:%s', config.auth.user, config.auth.pass);
transporter.verify(function (error, success) {
  if (error) {
    console.log('SMTP邮箱配置异常：', error);
  }
  if (success) {
    console.log("SMTP邮箱配置正常！");
  }
});

// 提醒站长
exports.notice = (comment, parentComment) => {
  // 站长自己发的评论不需要通知
  if (
    comment.get("mail") === process.env.TO_EMAIL ||
    comment.get("mail") === process.env.BLOGGER_EMAIL ||
    comment.get("mail") === process.env.SMTP_USER
  ) {
    return;
  }

  const name = comment.get("nick");
  const text = comment.get("comment");
  const url = process.env.SITE_URL + comment.get("url");
  const comment_id = process.env.COMMENT ? process.env.COMMENT : "";
  const main_color = process.env.MAIN_COLOR ? process.env.MAIN_COLOR : "orange";
  const main_img = process.env.MAIN_IMG
    ? process.env.MAIN_IMG
    : "https://ae01.alicdn.com/kf/U5bb04af32be544c4b41206d9a42fcacfd.jpg";

  if (!process.env.DISABLE_EMAIL) {
    const emailSubject =
      "📌 哇！「" + process.env.SITE_NAME + "」上有人回复了你啦！快点我！💦";
    const emailContent = noticeTemplate({
      siteName: process.env.SITE_NAME,
      siteUrl: process.env.SITE_URL,
      name: name,
      text: text,
      main_img: main_img,
      main_color: main_color,
      url: url + comment_id,
      mail: comment.get("mail"),
    });
    const mailOptions = {
      from: '"' + process.env.SENDER_NAME + '" <' + process.env.SMTP_USER + ">",
      to:
        process.env.TO_EMAIL ||
        process.env.BLOGGER_EMAIL ||
        process.env.SMTP_USER,
      subject: emailSubject,
      html: emailContent,
    };

    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.error(error);
      }
      comment.set("isNotified", true);
      comment.save();
      console.log("收到一条评论, 已邮件提醒站长");
    });
  }

  // 微信提醒
  let scContent;
  if (parentComment) {
    let pName = parentComment.get("nick");
    let pText = parentComment.get("comment");
    let pMail = parentComment.get("mail");
    scContent =
`@face=193@ 叮！「${process.env.SITE_NAME}」上 ${pName + "(" + pMail + ")"} 的评论：
      ${
          $(pText
              .replace(/<img.*?src="(.*?)".*?>/g, "\n[图片]$1\n")
              .replace(/<br>/g, "")
          ).text()
              .replace(/\n+/g, "")
              .replace(/\n+$/g, "")
      }\n
有人回复了：\n
      ${
            $(text
                .replace(/<img.*?src="(.*?)".*?>/g, "\n[图片]$1\n")
                .replace(/<br>/g, "")
            ).text()
                .replace(/\n+/g, "")
                .replace(/\n+$/g, "")
        }\n
@face=219@ 原文地址：${url}
@face=219@ 评论人：${name + "(" + comment.get("mail") + ")"}`;
  } else {
    scContent =
        `@face=193@ 叮！「${process.env.SITE_NAME}」上有人回复了你啦：\n
      ${
            $(text
                .replace(/<img.*?src="(.*?)".*?>/g, "\n[图片]$1\n")
                .replace(/<br>/g, "")
            ).text()
                .replace(/\n+/g, "")
                .replace(/\n+$/g, "")
        }\n
@face=219@ 原文地址：${url}
@face=219@ 评论人：${name + "(" + comment.get("mail") + ")"}`;
  }
  if (process.env.SCKEY != null) {
    axios({
      method: "post",
      url: `https://sc.ftqq.com/${process.env.SCKEY}.send`,
      data: `text=${process.env.SITE_NAME} 来新评论啦！&desp=${scContent}`,
      headers: {
        "Content-type": "application/x-www-form-urlencoded",
      },
    })
      .then(function (response) {
        if (response.status === 200 && response.data.errmsg === "success")
          console.log("已微信提醒站长");
        else console.log("微信提醒失败:", response.data);
      })
      .catch(function (error) {
        console.warn("微信提醒失败:", error.message);
      });
  }
  // QQ提醒
  if (process.env.QMSG_KEY != null) {
    if (process.env.QQ_SHAKE != null) {
      axios
        .get(
          `https://qmsg.zendee.cn:443/send/${
            process.env.QMSG_KEY
          }?msg=${encodeURIComponent("[CQ:shake]")}`
        )
        .then(function (response) {
          if (response.status === 200 && response.data.success === true) {
            console.log("已发送QQ戳一戳");
          } else {
            console.error("发送QQ戳一戳失败:", response.data);
          }
        })
        .catch(function (error) {
          console.error("发送QQ戳一戳失败:", error.message);
        });
    }
    let qq = "";
    if (process.env.QQ != null) {
      qq = "&qq=" + process.env.QQ;
    }

    axios
      .get(
        `https://qmsg.zendee.cn:443/send/${
          process.env.QMSG_KEY
        }?msg=${encodeURIComponent(scContent)}` + qq
      )
      .then(function (response) {
        if (response.status === 200 && response.data.success === true)
          console.log("已QQ提醒站长");
        else console.warn("QQ提醒失败:", response.data);
      })
      .catch(function (error) {
        console.error("QQ提醒失败:", error.message);
      });
  }
};

// 发送邮件通知他人
exports.send = (currentComment, parentComment) => {
  if (process.env.DISABLE_EMAIL) {
    return;
  }
  // 站长被 @ 不需要提醒
  if (
    parentComment.get("mail") === process.env.TO_EMAIL ||
    parentComment.get("mail") === process.env.BLOGGER_EMAIL ||
    parentComment.get("mail") === process.env.SMTP_USER
  ) {
    return;
  }
  const emailSubject =
    "📌 哇！「" + process.env.SITE_NAME + "」上有人回复了你啦！快点我！💦";
  const main_color = process.env.MAIN_COLOR ? process.env.MAIN_COLOR : "orange";
  const main_img = process.env.MAIN_IMG
    ? process.env.MAIN_IMG
    : "https://ae01.alicdn.com/kf/U5bb04af32be544c4b41206d9a42fcacfd.jpg";
  const emailContent = sendTemplate({
    siteName: process.env.SITE_NAME,
    siteUrl: process.env.SITE_URL,
    pname: parentComment.get("nick"),
    ptext: parentComment.get("comment"),
    name: currentComment.get("nick"),
    text: currentComment.get("comment"),
    main_img: main_img,
    main_color: main_color,
    url:
      process.env.SITE_URL +
      currentComment.get("url") +
      "#" +
      currentComment.get("pid"),
  });
  const mailOptions = {
    from: '"' + process.env.SENDER_NAME + '" <' + process.env.SMTP_USER + ">",
    to: parentComment.get("mail"),
    subject: emailSubject,
    html: emailContent,
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      return console.log(error);
    }
    currentComment.set("isNotified", true);
    currentComment.save();
    console.log(
      currentComment.get("nick") +
        " @了" +
        parentComment.get("nick") +
        ", 已通知."
    );
  });
};