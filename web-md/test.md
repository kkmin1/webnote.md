# 신기능 마크다운 편집기

## 특징
- 마크다운 문법에서 한글 편집시 단어의 굵게 표시 명령(**)바로 뒤에 문자가 **공백**없이 붙을 경우 발생하는 **"오류"**를 해결
- 범위 표시 "1개 ~ 2개"와 같은 표현에서 ~를 취소선으로 인식하는 오류 해결
- svg 형식 이미지 렌더링
- latex 수식 지원
- latex 이미지 그리기. tikz 지원
- latex 표 만들기
- html 문법 지원

## 예
* This is a **Premium** Markdown Editor.
* 사과가 3~4개 있습니다. 배가 1~2개 있습니다.
* 가격은 $2, $3, $4로 $2~$4 입니다.


**니콜라스 마두로(Nicolás Maduro)** 정권은 미국과 대립 중이었고, 미국은 마두로를 불법적인 독재자로 규정하면서 제재와 외교적 압박을 가하고 있었습니다. 2019년에는 미국과 여러 서방국가가 **후안 과이도(Juan Guaidó)**를 베네수엘라의 합법적 대통령으로 인정하면서 권력 충돌이 이어지고 있었죠.

## html 문법
* 나는 <strong>학교</strong>에 간다.
* <i>나는 <b>학교</b>에 간다.</i>
* <mark>형광펜 효과</mark>  
* 나는 <span style="color:red">빨간 글자</span>를 좋아한다.  

###  링크, 이미지
* 구글 홈페이지: https://google.com

![그림1](test.jpg)

![그림2](http://www.gstatic.com/webp/gallery/5.jpg)

![svg](diagram.svg)


## LaTeX 수식 Example
Inline math: \( f(x) = \int_{-\infty}^\infty \hat{f}(\xi) e^{2\pi i \xi x} d\xi \)

<br>

Block integral:
$$f(x) = \int_{-\infty}^\infty \hat{f}(\xi) e^{2\pi i \xi x} d\xi$$
<br>
Block math: \[ f(x) = \int_{-\infty}^\infty \hat{f}(\xi) e^{2\pi i \xi x} d\xi \]

이 행렬의 고유값이 $\alpha$와 $\beta$이며, 대각화를 통해 일반항을 유도할 수 있습니다.

\[
S = \left\{ (x, y) \in \mathbb{R}^2 \mid x^2 + y^2 \le 25, x \ge 0, y \ge 0 \right\}
\]

행렬:

$$\begin{bmatrix} a & b \\ c & d \end{bmatrix}$$

$$\begin{pmatrix} a & b \\ c & d \end{pmatrix}$$

$$\begin{vmatrix} a & b \\ c & d \end{vmatrix}$$

$$\begin{cases} -x, & \text{if } x < 0 \\ +x, & \text{if } x \geq 0 \end{cases}$$



```javascript
function greet() {
  console.log("Hello from Nova!");
}
```
<br>

#### 용의자의 딜레마
| 갑\( \backslash \)을 | 협조 | 배신 |
|---|---|---|
| **협조** | -1,-1 | -9,0 |
| **배신** | 0,-9 | -5,-5 |


<br>
<table >
  <caption>표 1. 죄인들의 딜렘마</caption>
  <tr >
    <th id = "diag"> <span style="margin-right: 26px;">갑</span>을</th>
    <th > C </th>
    <th > D </th>
  </tr>
  <tr >
    <th > C </th>
    <td > -1,-1 </td>
    <td > -9, 0 </td>
  </tr>
  <tr >
    <th > D </th>
    <td >  0, -9 </td>
    <td > -5, -5 </td>
  </tr>

</table>

<br>

<h2>여행 상품 가격표</h2>

\begin{tabular}{|c|c|c|c|}
\hline
\diagbox{가격}{나이} & \textbf{성인} & \textbf{아동(12세 미만)} & \textbf{유아(2세 미만)} \\ \hline \hline
기본 상품가 & 500,000 & 150,000 & 70,000 \\ \hline
유류 할증료 & 80,000 & 80,000 & 0 \\ \hline
\color{red}{총 가격} & 580,000 & 230,000 & 70,000 \\ \hline
\end{tabular}

 
## tikz 지원
       
 $$\usetikzlibrary{decorations.pathmorphing} \begin{tikzpicture}[line
            width=0.2mm,scale=1.0545]\small \tikzset{&gt;=stealth}
            \tikzset{snake it/.style={-&gt;,semithick,
            decoration={snake,amplitude=.3mm,segment length=2.5mm,post
            length=0.9mm},decorate}} \def\h{3} \def\d{0.2} \def\ww{1.4}
            \def\w{1+\ww} \def\p{1.5} \def\r{0.7} \coordinate[label=below:$A_1$]
            (A1) at (\ww,\p); \coordinate[label=above:$B_1$] (B1) at
            (\ww,\p+\h); \coordinate[label=below:$A_2$] (A2) at (\w,\p);
            \coordinate[label=above:$B_2$] (B2) at (\w,\p+\h);
            \coordinate[label=left:$C$] (C1) at (0,0);
            \coordinate[label=left:$D$] (D) at (0,\h);
            \draw[fill=blue!14](A2)--(B2)-- ++(\d,0)-- ++(0,-\h)--cycle;
            \draw[gray,thin](C1)-- +(\w+\d,0);
            \draw[dashed,gray,fill=blue!5](A1)-- (B1)-- ++(\d,0)-- ++(0,-\h)--
            cycle; \draw[dashed,line width=0.14mm](A1)--(C1)--(D)--(B1);
            \draw[snake it](C1)--(A2) node[pos=0.6,below] {$c\Delta t$};
            \draw[-&gt;,semithick](\ww,\p+0.44*\h)-- +(\w-\ww,0)
            node[pos=0.6,above] {$v\Delta t$}; \draw[snake it](D)--(B2);
            \draw[thin](\r,0) arc (0:atan2(\p,\w):\r)
            node[midway,right,yshift=0.06cm] {$\theta$};
            \draw[opacity=0](-0.40,-0.14)-- ++(0,5.06); \end{tikzpicture}$$
       
        
$$\usetikzlibrary{decorations.pathmorphing} 
\begin{tikzpicture}[scale=2] \draw [thick, ->] (-2,0.5) --
            (5,0.5); \draw [thick, ->] (-1,-1) -- (-1,4); \draw [blue, thick]
            (-1,0.5) -- (4,4); \draw [dashed] (3.2,0.5) -- (3.2,4); \draw
            [orange,thick] (-1,0.5) .. controls (1,3) and (3,3.5) .. (4,3.6);
            \filldraw [gray] (3.2,0.5) circle (2pt); \draw [red, thick] (-1,0.5)
            .. controls (1,1.5) and (3,1.5) .. (4.5,-1); \node at (-1.5,0)
            {$0$}; \node at (5.5,0.5){$k(t)$}; \node at (3.2,0){$k(t)^*$}; \node
            at (1.7,1.3){$sy(k)-\lambda k$}; \node at (4.2,4.2){$\lambda k$};
            \node at (4.5,3.6){$sy(k)$}; \end{tikzpicture} $$